const {SQSClient, SendMessageCommand} = require("@aws-sdk/client-sqs");
const {deflateStringifyObject} = require('../lib/CommonUtility');
const region = process.env.AWS_REGION || 'us-east-1';
const sqsClient = new SQSClient({region});

const sendMessage = async (queueURL, messageBody) => {

  const input = {
    QueueUrl: queueURL,
    MessageBody: Buffer.from(JSON.stringify(messageBody)).toString('base64'),
  }
  const command = new SendMessageCommand(input);

  try {
    const result = await sqsClient.send(command);
    return result;
  } catch (error) {
    console.error('SQSService -> sendMessage: ', error);
    throw error;
  }
}

const sendObject = async (queueURL, inputObject) => {

  const messageBody = deflateStringifyObject(inputObject);
  const input = {
    QueueUrl: queueURL,
    MessageBody: messageBody,
  }
  const command = new SendMessageCommand(input);

  try {
    const result = await sqsClient.send(command);
    return result;
  } catch (error) {
    console.error('SQSService -> sendObject: ', error);
    throw error;
  }
}

module.exports = {
  sendMessage,
  sendObject,
}
