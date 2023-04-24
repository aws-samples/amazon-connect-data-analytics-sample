const SQSService = require('../services/SQSService');
const S3Service = require('../services/S3Service');
const {parseFileTimestampUTC, inflateParseObject} = require('../lib/CommonUtility');
const FirehoseService = require('./FirehoseService');

const clOutputFileLoaderQueueURL = process.env.CLOutputFileLoaderQueueURL;
const clRecordWriterQueueURL = process.env.CLRecordWriterQueueURL;
const clKinesisFirehoseName = process.env.CLKinesisFirehoseName;

const clEventProcessor = async (event) => {

  const s3Bucket = event?.detail?.bucket?.name;
  if (!s3Bucket) return 's3Bucket not found in the payload';

  const s3ObjectKey = event?.detail?.object?.key;
  if (!s3Bucket) return 's3ObjectKey not found in the payload';

  console.info(`ContactLensService -> clEventProcessor -> Checking if ${s3ObjectKey} match Original analyzed transcript file pattern`);
  if (!isS3ObjectKeyValid(s3ObjectKey)) return 's3ObjectKey does not match Original analyzed transcript file pattern';

  const clOutputFileDetails = {
    s3Bucket,
    s3ObjectKey,
  }

  console.info(`ContactLensService -> clEventProcessor -> Sending to ${clOutputFileLoaderQueueURL} queue: `, clOutputFileDetails);
  const clEventProcessorResult = await SQSService.sendObject(clOutputFileLoaderQueueURL, clOutputFileDetails).catch(error => {
    console.error(`ContactLensService -> clEventProcessor -> SQSService.sendMessage failed:`, error);
    throw error;
  });

  return clEventProcessorResult;
}

const isS3ObjectKeyValid = (s3ObjectKey) => {

  //We need to match Original analyzed transcript file: Analysis/Voice/2020/02/04/contactID_analysis_2020-02-04T21:14:16Z.json
  //We don't want Redacted analyzed transcript file: /connect-instance- bucket/Analysis/Voice/Redacted/2020/02/04/contactID_analysis_redacted_2020-02-04T21:14:16Z.json
  //We don't want Redacted audio file: /connect-instance- bucket/Analysis/Voice/Redacted/2020/02/04/contactID_call_recording_redacted_2020-02-04T21:14:16Z.wav

  const contactLensOutputFileRegex = /^Analysis\/Voice\/\d{4}\/\d{2}\/\d{2}\/[a-z0-9]{8}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{12}_analysis_\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z.json/
  return s3ObjectKey.match(contactLensOutputFileRegex);
}

const clOutputFileLoader = async (event) => {

  let processCLOutputFilePromises = [];
  for (const record of event.Records) {
    const inboundSQSMessageId = record.messageId;
    processCLOutputFilePromises.push(processCLOutputFile(record.body, inboundSQSMessageId));
  }

  const processCLOutputFileResults = await Promise.allSettled(processCLOutputFilePromises);

  const processCLOutputFileErrors = processCLOutputFileResults.filter((processCLOutputFileResult) => processCLOutputFileResult.value?.error);

  if (processCLOutputFileErrors.length > 0) {
    console.error(`ContactLensService -> clOutputFileLoader -> processCLOutputFileErrors: ${processCLOutputFileErrors.length}`);

    const batchItemFailures = processCLOutputFileErrors.map((processCLOutputFileError) => {
      return {itemIdentifier: processCLOutputFileError.value?.inboundSQSMessageId}
    });
    return {batchItemFailures};
  }
  return {success: true};
}

const processCLOutputFile = async (recordBody, inboundSQSMessageId) => {
  try {
    const clOutputFileDetails = inflateParseObject(recordBody);
    console.debug('ContactLensService -> processCLOutputFile -> clOutputFileDetails:', clOutputFileDetails);

    const contactLensObject = await S3Service.getObjectFromJSONFile(clOutputFileDetails.s3Bucket, clOutputFileDetails.s3ObjectKey).catch(error => {
      console.error(`ContactLensService -> processCLOutputFile -> S3Service.getObjectFromJSONFile failed:`, error);
      throw error;
    });
    if (!contactLensObject) return 'contactLensObject not parsed';
    console.debug(`ContactLensService -> processCLOutputFile -> contactLensObject: `, JSON.stringify(contactLensObject));

    const contactLensDetails = extractContactLensDetails(contactLensObject);

    console.info(`ContactLensService -> processCLOutputFile -> Sending to ${clRecordWriterQueueURL} queue: `, contactLensDetails);
    const processCLOutputFileResult = await SQSService.sendObject(clRecordWriterQueueURL, contactLensDetails).catch(error => {
      console.error(`ContactLensService -> processCLOutputFile -> SQSService.sendMessage failed:`, error);
      throw error;
    });

    return {
      inboundSQSMessageId,
      outboundSQSMessageId: processCLOutputFileResult.MessageId
    }
  } catch (error) {
    console.error(`ContactLensService -> processCLOutputFile failed:`, error);
    return ({error, inboundSQSMessageId});
  }
}

const extractContactLensDetails = (contactLensObject) => {

  const contactId = contactLensObject.CustomerMetadata?.ContactId;
  const instanceId = contactLensObject.CustomerMetadata?.InstanceId;
  const recordingTimestamp = extractRecordingTimestamp(contactLensObject.CustomerMetadata.InputS3Uri, contactId).toISOString();

  const channel = contactLensObject.Channel;
  const languageCode = contactLensObject.LanguageCode;
  const matchedCategories = contactLensObject.Categories?.MatchedCategories;
  const totalConversationDuration = Math.floor(contactLensObject.ConversationCharacteristics?.TotalConversationDurationMillis / 1000);

  const overallSentimentAgent = contactLensObject.ConversationCharacteristics?.Sentiment?.OverallSentiment?.AGENT;
  const overallSentimentCustomer = contactLensObject.ConversationCharacteristics?.Sentiment?.OverallSentiment?.CUSTOMER;

  const interruptionsTotalCount = contactLensObject.ConversationCharacteristics?.Interruptions?.TotalCount;
  const nonTalkTimeTotal = Math.floor(contactLensObject.ConversationCharacteristics?.NonTalkTime?.TotalTimeMillis / 1000);

  const averageWordsPerMinuteAgent = contactLensObject.ConversationCharacteristics?.TalkSpeed?.DetailsByParticipant?.AGENT?.AverageWordsPerMinute;
  const averageWordsPerMinuteCustomer = contactLensObject.ConversationCharacteristics?.TalkSpeed?.DetailsByParticipant?.CUSTOMER?.AverageWordsPerMinute;

  const talkTimeTotal = Math.floor(contactLensObject.ConversationCharacteristics?.TalkTime?.TotalTimeMillis / 1000);
  const talkTimeAgent = Math.floor(contactLensObject.ConversationCharacteristics?.TalkTime?.DetailsByParticipant?.AGENT?.TotalTimeMillis / 1000);
  const talkTimeCustomer = Math.floor(contactLensObject.ConversationCharacteristics?.TalkTime?.DetailsByParticipant?.CUSTOMER?.TotalTimeMillis / 1000);

  const callSummary = extractCallSummary(contactLensObject.Transcript);

  return {
    contactId,
    instanceId,
    recordingTimestamp,
    channel,
    languageCode,
    matchedCategories,
    totalConversationDuration,
    overallSentimentAgent,
    overallSentimentCustomer,
    interruptionsTotalCount,
    nonTalkTimeTotal,
    averageWordsPerMinuteAgent,
    averageWordsPerMinuteCustomer,
    talkTimeTotal,
    talkTimeAgent,
    talkTimeCustomer,
    callSummary,
  }
}

const extractRecordingTimestamp = (inputS3Uri, contactId) => {
  const fileName = /[^/]*$/.exec(inputS3Uri)[0]?.replace(/\.[^/.]+$/, '');
  const timestampString = fileName.match(`(?<=${contactId}_).+`)?.[0];
  const recordingTimestamp = parseFileTimestampUTC(timestampString);
  return recordingTimestamp;
}

const extractCallSummary = (contactLensObjectTranscript) => {

  let issuesDetectedCount = 0;
  let actionItemsDetectedCount = 0;
  let outcomesDetectedCount = 0;

  contactLensObjectTranscript.forEach(transcriptItem => {
    issuesDetectedCount += transcriptItem.IssuesDetected?.length ?? 0;
    actionItemsDetectedCount += transcriptItem.ActionItemsDetected?.length ?? 0;
    outcomesDetectedCount += transcriptItem.OutcomesDetected?.length ?? 0;
  });

  return {
    issuesDetectedCount,
    actionItemsDetectedCount,
    outcomesDetectedCount,
  }
}

const clRecordWriter = async (event) => {

  let writeCLRecordPromises = [];
  for (const record of event.Records) {
    const inboundSQSMessageId = record.messageId;
    writeCLRecordPromises.push(writeCLRecord(record.body, inboundSQSMessageId));
  }

  const writeCLRecordResults = await Promise.allSettled(writeCLRecordPromises);

  const writeCLRecordErrors = writeCLRecordResults.filter((writeCLRecordResult) => writeCLRecordResult.value?.error);

  if (writeCLRecordErrors.length > 0) {
    console.error(`ContactLensService -> clRecordWriter -> writeCLRecordErrors: ${writeCLRecordErrors.length}`);

    const batchItemFailures = writeCLRecordErrors.map((writeCLRecordError) => {
      return {itemIdentifier: writeCLRecordError.value?.inboundSQSMessageId}
    });
    return {batchItemFailures};
  }
  return {success: true};
}

const writeCLRecord = async (recordBody, inboundSQSMessageId) => {

  try {
    const contactLensDetails = inflateParseObject(recordBody);
    console.debug('ContactLensService -> writeCLRecord -> contactLensDetails:', contactLensDetails);

    const putJSONToFirehoseResult = await FirehoseService.putJSONToFirehose(clKinesisFirehoseName, contactLensDetails).catch(error => {
      console.error(`ContactLensService -> writeCLRecord -> FirehoseService.putJSONToFirehose failed:`, error);
      throw error;
    });

    return {
      inboundSQSMessageId,
      firehoseRecordId: putJSONToFirehoseResult.RecordId,
    }
  } catch (error) {
    console.error(`ContactLensService -> writeCLRecord failed:`, error);
    return ({error, inboundSQSMessageId});
  }
}

module.exports = {
  clEventProcessor,
  clOutputFileLoader,
  clRecordWriter,
}