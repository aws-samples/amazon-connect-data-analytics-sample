const SQSService = require('../services/SQSService');
const S3Service = require('../services/S3Service');
const FirehoseService = require('./FirehoseService');

const {extractEvaluationFormDetails} = require('../lib/EFScoringUtil');
const {inflateParseObject} = require('../lib/CommonUtility');

const efOutputFileLoaderQueueURL = process.env.EFOutputFileLoaderQueueURL;
const efRecordWriterQueueURL = process.env.EFRecordWriterQueueURL;
const efKinesisFirehoseName = process.env.EFKinesisFirehoseName;

const efEventProcessor = async (event) => {

  const s3Bucket = event?.detail?.bucket?.name;
  if (!s3Bucket) return 's3Bucket not found in the payload';

  const s3ObjectKey = event?.detail?.object?.key;
  if (!s3Bucket) return 's3ObjectKey not found in the payload';

  console.info(`EvaluationFormsService -> efEventProcessor -> Checking if ${s3ObjectKey} match Evaluation Forms output file pattern`);
  if (!isS3ObjectKeyValid(s3ObjectKey)) return 's3ObjectKey does not match Evaluation Forms output file pattern';

  const efOutputFileDetails = {
    s3Bucket,
    s3ObjectKey,
  }

  console.info(`EvaluationFormsService -> efEventProcessor -> Sending to ${efOutputFileLoaderQueueURL} queue: `, efOutputFileDetails);
  const efEventProcessorResult = await SQSService.sendObject(efOutputFileLoaderQueueURL, efOutputFileDetails).catch(error => {
    console.error(`EvaluationFormsService -> efEventProcessor -> SQSService.sendMessage failed:`, error);
    throw error;
  });

  return efEventProcessorResult;
}

const isS3ObjectKeyValid = (s3ObjectKey) => {

  //We need to match evaluation form file: 17:40:38.601Z-9fbed44b-8cd8-4c09-983f-d4b407698419-v3_1.json
  //We don't want deleted evaluation form file: 12:43:43.490Z-1fb0fa2c-ebbc-48d1-8654-ba88adf3d631-v3_1_DELETED.json

  const evaluationFormsOutputFileRegex = /^connect\/[a-zA-Z0-9-]+\/[a-zA-Z0-9-]+\/\d{4}\/\d{2}\/\d{2}\/\d{2}:\d{2}:\d{2}\.\d{3}Z-[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}-v3_1\.json$/;
  return s3ObjectKey.match(evaluationFormsOutputFileRegex);
}

const efOutputFileLoader = async (event) => {

  let processEFOutputFilePromises = [];
  for (const record of event.Records) {
    const inboundSQSMessageId = record.messageId;
    processEFOutputFilePromises.push(processEFOutputFile(record.body, inboundSQSMessageId));
  }

  const processEFOutputFileResults = await Promise.allSettled(processEFOutputFilePromises);

  const processEFOutputFileErrors = processEFOutputFileResults.filter((processEFOutputFileResult) => processEFOutputFileResult.value?.error);

  if (processEFOutputFileErrors.length > 0) {
    console.error(`EvaluationFormsService -> efOutputFileLoader -> processEFOutputFileErrors: ${processEFOutputFileErrors.length}`);

    const batchItemFailures = processEFOutputFileErrors.map((processEFOutputFileError) => {
      return {itemIdentifier: processEFOutputFileError.value?.inboundSQSMessageId}
    });
    return {batchItemFailures};
  }
  return {success: true};
}

const processEFOutputFile = async (recordBody, inboundSQSMessageId) => {
  try {

    const efOutputFileDetails = inflateParseObject(recordBody);
    console.debug('EvaluationFormsService -> processEFOutputFile -> efOutputFileDetails:', efOutputFileDetails);

    const evaluationFormObject = await S3Service.getObjectFromJSONFile(efOutputFileDetails.s3Bucket, efOutputFileDetails.s3ObjectKey).catch(error => {
      console.error(`EvaluationFormsService -> processEFOutputFile -> S3Service.getObjectFromJSONFile failed:`, error);
      throw error;
    });
    if (!evaluationFormObject) return 'evaluationFormObject not parsed';
    console.debug(`EvaluationFormsService -> processEFOutputFile -> evaluationFormObject: `, JSON.stringify(evaluationFormObject));

    const evaluationFormDetails = extractEvaluationFormDetails(evaluationFormObject);

    console.info(`EvaluationFormsService -> processEFOutputFile -> Sending to ${efRecordWriterQueueURL} queue: `, evaluationFormDetails);
    const processEFOutputFileResult = await SQSService.sendObject(efRecordWriterQueueURL, evaluationFormDetails).catch(error => {
      console.error(`EvaluationFormsService -> processEFOutputFile -> SQSService.sendMessage failed:`, error);
      throw error;
    });

    return {
      inboundSQSMessageId,
      outboundSQSMessageId: processEFOutputFileResult.MessageId
    }
  } catch (error) {
    console.error(`EvaluationFormsService -> processEFOutputFile failed:`, error);
    return ({error, inboundSQSMessageId});
  }
}

const efRecordWriter = async (event) => {

  let writeEFRecordPromises = [];
  for (const record of event.Records) {
    const inboundSQSMessageId = record.messageId;
    writeEFRecordPromises.push(writeEFRecord(record.body, inboundSQSMessageId));
  }

  const writeEFRecordResults = await Promise.allSettled(writeEFRecordPromises);

  const writeEFRecordErrors = writeEFRecordResults.filter((writeEFRecordResult) => writeEFRecordResult.value?.error);

  if (writeEFRecordErrors.length > 0) {
    console.error(`EvaluationFormsService -> efRecordWriter -> writeEFRecordErrors: ${writeEFRecordErrors.length}`);

    const batchItemFailures = writeEFRecordErrors.map((writeEFRecordError) => {
      return {itemIdentifier: writeEFRecordError.value?.inboundSQSMessageId}
    });
    return {batchItemFailures};
  }
  return {success: true};
}

const writeEFRecord = async (recordBody, inboundSQSMessageId) => {

  try {
    const evaluationFormDetails = inflateParseObject(recordBody);
    console.debug('EvaluationFormsService -> writeEFRecord -> evaluationFormDetails:', evaluationFormDetails);

    const putJSONToFirehoseResult = await FirehoseService.putJSONToFirehose(efKinesisFirehoseName, evaluationFormDetails).catch(error => {
      console.error(`EvaluationFormsService -> writeEFRecord -> FirehoseService.putJSONToFirehose failed:`, error);
      throw error;
    });

    return {
      inboundSQSMessageId,
      firehoseRecordId: putJSONToFirehoseResult.RecordId,
    }
  } catch (error) {
    console.error(`EvaluationFormsService -> writeEFRecord failed:`, error);
    return ({error, inboundSQSMessageId});
  }
}

module.exports = {
  efEventProcessor,
  efOutputFileLoader,
  efRecordWriter,
}