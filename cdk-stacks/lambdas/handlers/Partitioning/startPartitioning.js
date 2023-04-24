const PartitioningService = require('../../services/PartitioningService');

exports.handler = async (event) => {

  try {
    console.debug(`Event: `, event);

    const startPartitioningResult = await PartitioningService.startPartitioning(event.s3_bucket, event.s3_prefix, event.table_name, event.overridePartitionLoad);
    console.info('startPartitioningResult: ', startPartitioningResult);
    return startPartitioningResult;
  } catch (error) {
    console.error('PartitioningService: ', error);
    throw error;
  }
}