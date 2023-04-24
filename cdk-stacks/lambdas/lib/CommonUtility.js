const zlib = require('zlib');

const parseFileTimestampUTC = (fileTimestampString) => {
  //the input format is: 20220425T14:17_UTC
  const year = fileTimestampString.substring(0, 4);
  const month = fileTimestampString.substring(4, 6);
  const day = fileTimestampString.substring(6, 8);

  const hour = fileTimestampString.substring(9, 11);
  const minute = fileTimestampString.substring(12, 14);
  const second = "00";

  const isoDateString = `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
  const parsedDate = new Date(Date.parse(isoDateString));
  return parsedDate;
}

const timestampMillisToISO = (timestamp) => {
  if (!timestamp) return null;

  const d = new Date(0);
  d.setUTCMilliseconds(timestamp);
  return d.toISOString();
}

const isInteger = (str) => {
  if (typeof str != "string") return false;
  return !isNaN(str) && !isNaN(parseInt(str));
}

const deflateStringifyObject = (inputObject = {}) => {
  const inputObjectJSON = JSON.stringify(inputObject);
  const deflatedInputObject = zlib.gzipSync(inputObjectJSON).toString('base64');
  return deflatedInputObject;
}

const inflateParseObject = (inputString) => {
  const buffer = Buffer.from(inputString, 'base64');
  const inflatedInputString = zlib.gunzipSync(buffer).toString('utf8');
  const parsedObject = JSON.parse(inflatedInputString);
  return parsedObject;
}

module.exports = {
  parseFileTimestampUTC,
  timestampMillisToISO,
  isInteger,
  deflateStringifyObject,
  inflateParseObject,
}