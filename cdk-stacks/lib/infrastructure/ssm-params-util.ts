import {Construct} from 'constructs';
import {StringParameter} from 'aws-cdk-lib/aws-ssm';

const configParams = require('../../config.params.json');

export const loadSSMParams = (scope: Construct) => {
  const params: any = {}
  const SSM_NOT_DEFINED = 'not-defined';
  for (const param of configParams.parameters) {
    if (param.boolean) {
      params[param.name] = (StringParameter.valueFromLookup(scope, `${configParams.hierarchy}${param.name}`).toLowerCase() === "true");
    } else {
      params[param.name] = StringParameter.valueFromLookup(scope, `${configParams.hierarchy}${param.name}`);
    }
  }
  return {...params, SSM_NOT_DEFINED}
}

export const fixDummyValueString = (value: string): string => {
  if (value.includes('dummy-value-for-')) return value.replace(/\//g, '-');
  else return value;
}
