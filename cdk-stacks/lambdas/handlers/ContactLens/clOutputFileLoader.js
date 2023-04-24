const ContactLensService = require('../../services/ContactLensService');

exports.handler = async (event) => {

  try {
    console.debug(`Event: `, event);
    const clOutputFileLoaderResult = await ContactLensService.clOutputFileLoader(event);
    console.info('CL Output File Loader result: ', clOutputFileLoaderResult);
    return clOutputFileLoaderResult;
  } catch (error) {
    console.error('CLOutputFileLoaderHandler: ', error);
    throw error;
  }

}