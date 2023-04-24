const PartitioningService = require('../../services/PartitioningService');

exports.handler = async (event) => {

  try {
    console.debug(`Event: `, event);

    const partitioningIteratorResult = PartitioningService.partitioningIterator(event.iterator.index, event.iterator.step, event.iterator.count, event.iterator.iteratorWaitInit);
    console.info('partitioningIteratorResult: ', partitioningIteratorResult);
    return partitioningIteratorResult;
  } catch (error) {
    console.error('PartitioningService: ', error);
    throw error;
  }
}