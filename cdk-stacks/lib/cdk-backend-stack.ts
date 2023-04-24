import {Stack, StackProps} from 'aws-cdk-lib';
import {Construct} from 'constructs';
import {StringParameter} from 'aws-cdk-lib/aws-ssm';
import * as glue from "aws-cdk-lib/aws-glue";

import {loadSSMParams} from '../lib/infrastructure/ssm-params-util';
import {CTRStack} from './contact-trace-records/ctr-stack';
import {AEStack} from './agent-events/ae-stack';
import {CFLStack} from './contact-flow-logs/cfl-stack';
import {PartitioningStack} from './partitioning/partitioning-stack';
import {CLStack} from './contact-lens/cl-stack';
import {EFStack} from './evaluation-forms/ef-stack';
import {EFReportingStack} from './evaluation-forms-reporting/ef-reporting-stack';

const configParams = require('../config.params.json');

export class CdkBackendStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    //store physical stack name to SSM
    const outputHierarchy = `${configParams.hierarchy}outputParameters`;
    const cdkBackendStackName = new StringParameter(this, 'CdkBackendStackName', {
      parameterName: `${outputHierarchy}/CdkBackendStackName`,
      stringValue: this.stackName
    });

    const ssmParams = loadSSMParams(this);

    //Define S3 bucket names
    const athenaResultsS3bucketName = `${configParams.CdkAppName}-ar-${this.account}-${this.region}`.toLowerCase();
    const ctrS3bucketName = `${configParams.CdkAppName}-ctr-${this.account}-${this.region}`.toLowerCase();
    const aeS3bucketName = `${configParams.CdkAppName}-ae-${this.account}-${this.region}`.toLowerCase();
    const cflS3bucketName = `${configParams.CdkAppName}-cfl-${this.account}-${this.region}`.toLowerCase();
    const clS3bucketName = `${configParams.CdkAppName}-cl-${this.account}-${this.region}`.toLowerCase();
    const efS3bucketName = `${configParams.CdkAppName}-ef-${this.account}-${this.region}`.toLowerCase();

    //Define S3 bucket names for server access logs
    const athenaResultsS3bucketAccessLogsName = `${configParams.CdkAppName}-ar-al-${this.account}-${this.region}`.toLowerCase();
    const ctrS3bucketAccessLogsName = `${configParams.CdkAppName}-ctr-al-${this.account}-${this.region}`.toLowerCase();
    const aeS3bucketAccessLogsName = `${configParams.CdkAppName}-ae-al-${this.account}-${this.region}`.toLowerCase();
    const cflS3bucketAccessLogsName = `${configParams.CdkAppName}-cfl-al-${this.account}-${this.region}`.toLowerCase();
    const clS3bucketAccessLogsName = `${configParams.CdkAppName}-cl-al-${this.account}-${this.region}`.toLowerCase();
    const efS3bucketAccessLogsName = `${configParams.CdkAppName}-ef-al-${this.account}-${this.region}`.toLowerCase();

    //Create Glue Database
    const amazonConnectDataAnalyticsDB = new glue.CfnDatabase(this, 'AmazonConnectDataAnalyticsDB', {
      catalogId: this.account,
      databaseInput: {
        name: ssmParams.awsGlueDatabaseName.toLowerCase(),
        description: 'AWS Glue Database to hold tables for Amazon Connect Data Analytics'
      },
    });

    //Create Partitioning Stack
    const partitioningStack = new PartitioningStack(this, 'PartitioningStack', {
      SSMParams: ssmParams,
      cdkAppName: configParams['CdkAppName'],
      athenaResultsS3bucketName,
      athenaResultsS3bucketAccessLogsName,
      ctrS3bucketName,
      aeS3bucketName,
      cflS3bucketName,
      clS3bucketName,
      efS3bucketName,
    });

    if (ssmParams.ctrStackEnabled) {//Create Contact Trace Records (CTR) Stack
      const ctrStack = new CTRStack(this, 'CtrStack', {
        SSMParams: ssmParams,
        cdkAppName: configParams['CdkAppName'],
        ctrS3bucketName,
        ctrS3bucketAccessLogsName,
        athenaPartitioningStateMachine: partitioningStack.athenaPartitioningStateMachine,
      });
    }

    if (ssmParams.aeStackEnabled) {//Create Agent Events (AE) Stack
      const aeStack = new AEStack(this, 'AEStack', {
        SSMParams: ssmParams,
        cdkAppName: configParams['CdkAppName'],
        aeS3bucketName,
        aeS3bucketAccessLogsName,
        athenaPartitioningStateMachine: partitioningStack.athenaPartitioningStateMachine,
      });
    }

    if (ssmParams.cflStackEnabled) {//Create Contact Flow Logs (CFL) Stack
      const cflStack = new CFLStack(this, 'CflStack', {
        SSMParams: ssmParams,
        cdkAppName: configParams['CdkAppName'],
        cflS3bucketName,
        cflS3bucketAccessLogsName,
        athenaPartitioningStateMachine: partitioningStack.athenaPartitioningStateMachine,
      });
    }

    if (ssmParams.clStackEnabled) { //Create Contact Lens (CL) Stack
      const clStack = new CLStack(this, 'CLStack', {
        SSMParams: ssmParams,
        cdkAppName: configParams['CdkAppName'],
        clS3bucketName,
        clS3bucketAccessLogsName,
        athenaPartitioningStateMachine: partitioningStack.athenaPartitioningStateMachine,
      });
    }

    if (ssmParams.efStackEnabled) { //Create Evaluation Forms (EF) Stack
      const efStack = new EFStack(this, 'EFStack', {
        SSMParams: ssmParams,
        cdkAppName: configParams['CdkAppName'],
        efS3bucketName,
        efS3bucketAccessLogsName,
        athenaPartitioningStateMachine: partitioningStack.athenaPartitioningStateMachine,
      });
    }

    if (ssmParams.efReportingStackEnabled) { //Create Evaluation Forms (EF) Reporting Stack
      const efReportingStack = new EFReportingStack(this, 'EFReportingStack', {
        SSMParams: ssmParams,
      });
    }
  }
}
