const EvaluationFormsService = require('../../services/EvaluationFormsService');

exports.handler = async (event) => {
  try {
    console.debug(`Event: `, event);
    const efEventProcessorResult = await EvaluationFormsService.efEventProcessor(event);
    console.info('EF Event Processor result: ', efEventProcessorResult);
    return efEventProcessorResult;
  } catch (error) {
    console.error('EFEventProcessorHandler: ', error);
    throw error;
  }
}