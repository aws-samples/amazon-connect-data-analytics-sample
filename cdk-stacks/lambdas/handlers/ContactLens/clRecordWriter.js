const ContactLensService = require('../../services/ContactLensService');

exports.handler = async (event) => {
  try {
    console.debug(`Event: `, event);
    const clRecordWriterResult = await ContactLensService.clRecordWriter(event);
    console.info('CL Record Writer result: ', clRecordWriterResult);
    return clRecordWriterResult;
  } catch (error) {
    console.error('CLRecordWriterHandler: ', error);
    throw error;
  }
}