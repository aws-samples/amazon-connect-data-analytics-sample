const ContactLensService = require('../../services/ContactLensService');

exports.handler = async (event) => {
  try {
    console.debug(`Event: `, event);
    const clEventProcessorResult = await ContactLensService.clEventProcessor(event);
    console.info('CL Event Processor result: ', clEventProcessorResult);
    return clEventProcessorResult;
  } catch (error) {
    console.error('CLEventProcessorHandler: ', error);
    throw error;
  }
}