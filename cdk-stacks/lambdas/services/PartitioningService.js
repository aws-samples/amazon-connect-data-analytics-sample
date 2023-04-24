const S3Service = require("../services/S3Service");
const AthenaService = require("../services/AthenaService");

const athenaResultsS3bucketName = process.env.AthenaResultsS3bucketName;

const startPartitioning = async (s3_bucket, s3_prefix, table_name, overridePartitionLoad) => {

  const currentTime = new Date();
  currentTime.setDate(currentTime.getDate() + 1);

  const partition_year = currentTime.getFullYear();
  const partition_month = ("0" + (currentTime.getMonth() + 1)).slice(-2);
  const partition_day = ("0" + currentTime.getDate()).slice(-2);

  let partition = 'year=' + partition_year + '/month=' + partition_month + '/day=' + partition_day + '/';
  console.info(`Date-based partition: ${partition}`);

  if (overridePartitionLoad && overridePartitionLoad.length > 0) {
    partition = overridePartitionLoad.endsWith('/') ? overridePartitionLoad : `${overridePartitionLoad}/`;
    console.info(`Found override partition, hence using partition: ${partition}`);
  }

  const partitionExists = await S3Service.checkObjectExists(s3_bucket, `${s3_prefix}/${partition}`).catch(error => {
    console.error('S3Service.checkObjectExists: ', error);
    throw error;
  });

  if (!partitionExists) {
    console.info(`Partition ${partition} doesn't exist in S3, creating...`);
    await S3Service.uploadObject(s3_bucket, `${s3_prefix}/${partition}`);
  } else {
    console.info(`Partition ${partition} already exists in S3`);
  }

  console.info(`Creating Athena partition: ${partition}`);
  const createPartitionResult = await AthenaService.createPartition(table_name, s3_bucket, s3_prefix, partition, `s3://${athenaResultsS3bucketName}/athena-partitioning/`).catch(error => {
    console.error('AthenaService.createPartition: ', error);
    throw error;
  });

  console.info(`AthenaService.createPartition -> QueryExecutionId: ${createPartitionResult.QueryExecutionId}`)

  return {
    queryExecutionId: createPartitionResult.QueryExecutionId,
    waitTime: 1
  };
}

const pollPartitioningStatus = async (queryExecutionId, waitTime) => {

  const queryExecutionStatus = await AthenaService.getQueryExecutionStatus(queryExecutionId).catch(error => {
    console.error('AthenaService.getQueryExecutionStatus: ', error);
    throw error;
  });

  return {
    queryExecutionId: queryExecutionStatus?.queryExecutionId,
    status: queryExecutionStatus?.status,
    waitTime: waitTime * 2,
  }
}

const getPartitioningResults = async (queryExecutionId) => {

  const queryResults = await AthenaService.getQueryResults(queryExecutionId).catch(error => {
    console.error('AthenaService.getQueryResults: ', error);
    throw error;
  });

  return queryResults;
}

const partitioningIterator = (index, step, count, iteratorWaitInit) => {

  const newIndex = index + step;

  const result = {
    index: newIndex,
    step,
    count,
    iteratorWaitInit,
    iteratorWaitCurrent: iteratorWaitInit * newIndex,
    continue: index < count
  }

  return result;
}

module.exports = {
  startPartitioning,
  pollPartitioningStatus,
  getPartitioningResults,
  partitioningIterator,
}