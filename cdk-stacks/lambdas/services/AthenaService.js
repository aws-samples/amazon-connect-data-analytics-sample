const {
  AthenaClient,
  StartQueryExecutionCommand,
  GetQueryExecutionCommand,
  GetQueryResultsCommand
} = require("@aws-sdk/client-athena");
const region = process.env.AWS_REGION || 'us-east-1';
const athenaClient = new AthenaClient({region});

const createPartition = async (table_name, s3_bucket, s3_prefix, partition, outputLocation) => {

  const input = {
    QueryString: `ALTER TABLE ${table_name}
      ADD IF NOT EXISTS PARTITION ( ${partition.split('/')[0]}, ${partition.split('/')[1]}, ${partition.split('/')[2]} ) location 's3://${s3_bucket}/${s3_prefix}/${partition}';`,
    ResultConfiguration: {
      OutputLocation: outputLocation
    }
  };
  const command = new StartQueryExecutionCommand(input);

  try {
    const result = await athenaClient.send(command);
    return result;
  } catch (error) {
    console.error('AthenaService.createPartition: ', error);
    throw error;
  }
}

const getQueryExecutionStatus = async (queryExecutionId) => {

  const input = {
    QueryExecutionId: queryExecutionId,
  };
  const command = new GetQueryExecutionCommand(input);

  try {
    const result = await athenaClient.send(command);
    return {
      queryExecutionId: result?.QueryExecution?.QueryExecutionId,
      status: result?.QueryExecution?.Status?.State,
    }
  } catch (error) {
    console.error('AthenaService.getQueryExecutionStatus: ', error);
    throw error;
  }
}

const getQueryResults = async (queryExecutionId, maxResults = 5) => {

  const input = {
    QueryExecutionId: queryExecutionId,
    MaxResults: maxResults
  };
  const command = new GetQueryResultsCommand(input);

  try {
    const result = await athenaClient.send(command);
    return result;
  } catch (error) {
    console.error('AthenaService.getQueryResults: ', error);
    throw error;
  }
}

module.exports = {
  createPartition,
  getQueryExecutionStatus,
  getQueryResults,
}