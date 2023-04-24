const {FirehoseClient, PutRecordCommand} = require("@aws-sdk/client-firehose");
const region = process.env.AWS_REGION || 'us-east-1';
const firehoseClient = new FirehoseClient({region});

const putJSONToFirehose = async (deliveryStreamName, objectData) => {

  const objectDataString = `${JSON.stringify(objectData)}\n`
  const result = await putRecord(deliveryStreamName, objectDataString);

  return result;
}

const putRecord = async (deliveryStreamName, objectDataString) => {

  const input = {
    DeliveryStreamName: deliveryStreamName, Record: {
      Data: Buffer.from(objectDataString),
    },
  }
  const command = new PutRecordCommand(input);

  try {
    const result = await firehoseClient.send(command);
    return result;
  } catch (error) {
    console.error('FirehoseService.putRecord: ', error);
    throw error;
  }
}

module.exports = {
  putJSONToFirehose,
}
