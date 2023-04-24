const PartitioningService = require('../../services/PartitioningService');

exports.handler = async (event) => {

  try {
    console.debug(`Event: `, event);

    const getPartitioningResultsResult = await PartitioningService.getPartitioningResults(event.result.queryExecutionId);
    console.info('getPartitioningResultsResult: ', getPartitioningResultsResult);
    return getPartitioningResultsResult;
  } catch (error) {
    console.error('PartitioningService: ', error);
    throw error;
  }
}