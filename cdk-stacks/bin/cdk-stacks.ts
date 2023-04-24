#!/usr/bin/env node
import 'source-map-support/register';
import {App, Aspects} from 'aws-cdk-lib';
import {AwsSolutionsChecks} from 'cdk-nag'

import {CdkBackendStack} from '../lib/cdk-backend-stack';

const {SSMClient} = require('@aws-sdk/client-ssm')


const configParams = require('../config.params.json');

const app = new App();
Aspects.of(app).add(new AwsSolutionsChecks({verbose: true}))

console.log("Running in stack mode...");
const cdkBackendStack = new CdkBackendStack(app, configParams['CdkBackendStack'], {
  env: {account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION}
});

