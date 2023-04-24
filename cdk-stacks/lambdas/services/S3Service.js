const {S3Client, ListObjectsV2Command, PutObjectCommand, GetObjectCommand} = require("@aws-sdk/client-s3");
const region = process.env.AWS_REGION || 'us-east-1';
const s3Client = new S3Client({region});

const checkObjectExists = async (bucketName, objectKey) => {

  const input = {
    Bucket: bucketName,
    Delimiter: '/',
    MaxKeys: 1,
    Prefix: objectKey,
  }
  const command = new ListObjectsV2Command(input);
  const result = await s3Client.send(command);

  return result?.KeyCount > 0;
}

const uploadObject = async (bucketName, objectKey, objectBody = '') => {

  const input = {
    Bucket: bucketName,
    Key: objectKey,
    Body: objectBody,
  }
  const command = new PutObjectCommand(input);
  const result = await s3Client.send(command);

  return result;
}

const getObjectFromJSONFile = async (s3Bucket, s3Key) => {

  console.debug(`S3Service -> getObjectFromJSONFile -> s3Bucket: ${s3Bucket} | s3Key: ${s3Key}`);

  const input = {
    Bucket: s3Bucket,
    Key: s3Key,
  };
  const command = new GetObjectCommand(input);

  try {
    const response = await s3Client.send(command);
    const bodyString = await response.Body.transformToString();
    const bodyJSON = JSON.parse(bodyString);

    return bodyJSON;
  } catch (error) {
    console.error(`S3Service -> getObjectFromJSONFile: `, error);
    throw error;
  }
}


module.exports = {
  checkObjectExists,
  uploadObject,
  getObjectFromJSONFile,
}