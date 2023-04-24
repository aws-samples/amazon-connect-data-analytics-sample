const EvaluationFormsService = require('../../services/EvaluationFormsService');

exports.handler = async (event) => {
  try {
    console.debug(`Event: `, event);
    const efRecordWriterResult = await EvaluationFormsService.efRecordWriter(event);
    console.info('EF Record Writer result: ', efRecordWriterResult);
    return efRecordWriterResult;
  } catch (error) {
    console.error('EFRecordWriterHandler: ', error);
    throw error;
  }
}