const EvaluationFormsService = require('../../services/EvaluationFormsService');

exports.handler = async (event) => {

  try {
    console.debug(`Event: `, event);
    const efOutputFileLoaderResult = await EvaluationFormsService.efOutputFileLoader(event);
    console.info('EF Output File Loader result: ', efOutputFileLoaderResult);
    return efOutputFileLoaderResult;
  } catch (error) {
    console.error('EFOutputFileLoaderHandler: ', error);
    throw error;
  }

}
