const PartitioningService = require('../../services/PartitioningService');

exports.handler = async (event) => {

  try {
    console.debug(`Event: `, event);

    const pollPartitioningStatusResult = await PartitioningService.pollPartitioningStatus(event.result.queryExecutionId, event.result.waitTime);
    console.info('pollPartitioningStatusResult: ', pollPartitioningStatusResult);
    return pollPartitioningStatusResult;
  } catch (error) {
    console.error('PartitioningService: ', error);
    throw error;
  }
}