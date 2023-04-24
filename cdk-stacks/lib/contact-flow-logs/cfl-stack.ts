import {Duration, NestedStack, NestedStackProps, RemovalPolicy} from 'aws-cdk-lib';
import {Construct} from 'constructs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as firehose from 'aws-cdk-lib/aws-kinesisfirehose';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as nodeLambda from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as glue from "aws-cdk-lib/aws-glue";
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as events from 'aws-cdk-lib/aws-events';
import * as eventTargets from 'aws-cdk-lib/aws-events-targets';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import {NagSuppressions} from "cdk-nag";

export interface CFLStackProps extends NestedStackProps {
  readonly SSMParams: any;
  readonly cdkAppName: string;
  readonly cflS3bucketName: string;
  readonly cflS3bucketAccessLogsName: string;
  readonly athenaPartitioningStateMachine: sfn.IStateMachine;
}

//Contact Flow Logs (CFL) Stack
export class CFLStack extends NestedStack {

  constructor(scope: Construct, id: string, props: CFLStackProps) {
    super(scope, id, props);

    //Amazon S3 bucket to store access logs for CFL
    const cflS3bucketAccessLogs = new s3.Bucket(this, 'CflS3bucketAccessLogs', {
      bucketName: props.cflS3bucketAccessLogsName,
      removalPolicy: RemovalPolicy.RETAIN,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_PREFERRED,
      enforceSSL: true,
      serverAccessLogsPrefix: 'logs',
    });

    //Amazon S3 bucket to store CFLs
    const cflS3bucket = new s3.Bucket(this, 'CflS3bucket', {
      bucketName: props.cflS3bucketName,
      removalPolicy: RemovalPolicy.RETAIN,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      serverAccessLogsBucket: cflS3bucketAccessLogs,
      enforceSSL: true,
      serverAccessLogsPrefix: 'logs',
    });

    //Amazon Kinesis Firehose Role that provides access to the destination Amazon S3 bucket
    const cflKinesisFirehoseS3DestinationRole = new iam.Role(this, 'CflKinesisFirehoseS3DestinationRole', {
      assumedBy: new iam.ServicePrincipal('firehose.amazonaws.com', {
        conditions: {'StringEquals': {'sts:ExternalId': this.account}}
      }),
    });
    cflS3bucket.grantReadWrite(cflKinesisFirehoseS3DestinationRole);
    NagSuppressions.addResourceSuppressions(cflKinesisFirehoseS3DestinationRole, [
      {
        id: 'AwsSolutions-IAM5',
        reason: 'It is justified because this is the intended behavior, for Kinesis to read and write to the S3 bucket and all its contents. We mitigate it by allowing read write permission to the specific Kinesis Firehose and specific S3 bucket'
      }
    ], true);

    //AWS Lambda - kinesis-firehose-cloudwatch-logs-processor
    const kinesisFirehoseCloudwatchLogsProcessorLambda = new nodeLambda.NodejsFunction(this, 'KinesisFirehoseCloudwatchLogsProcessorLambda', {
      functionName: `${props.cdkAppName}-FirehoseCloudwatchLogsProcessor`,
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: 'lambdas/handlers/RecordProcessors/kinesisFirehoseCloudwatchLogsProcessor.js',
      timeout: Duration.minutes(3),
    });
    NagSuppressions.addResourceSuppressions(kinesisFirehoseCloudwatchLogsProcessorLambda, [
      {
        id: 'AwsSolutions-IAM4',
        reason: 'This is the default Lambda Execution Policy which just grants writes to CloudWatch.',
      }
    ], true);
    kinesisFirehoseCloudwatchLogsProcessorLambda.grantInvoke(cflKinesisFirehoseS3DestinationRole);

    //Amazon Kinesis Firehose
    const cflKinesisFirehose = new firehose.CfnDeliveryStream(this, 'CflKinesisFirehose', {
      deliveryStreamName: `${props.cdkAppName}-CflKinesisFirehose`,
      deliveryStreamType: 'DirectPut',
      deliveryStreamEncryptionConfigurationInput: {
        keyType: 'AWS_OWNED_CMK',
      },
      extendedS3DestinationConfiguration: {
        bucketArn: cflS3bucket.bucketArn,
        roleArn: cflKinesisFirehoseS3DestinationRole.roleArn,
        prefix: 'fhbase/year=!{timestamp:YYYY}/month=!{timestamp:MM}/day=!{timestamp:dd}/',
        errorOutputPrefix: 'fherroroutputbase-error/!{firehose:random-string}/!{firehose:error-output-type}/!{timestamp:yyy/MM/dd}/',
        bufferingHints: {
          intervalInSeconds: 60,
          sizeInMBs: 128,
        },
        processingConfiguration: {
          enabled: true,
          processors: [
            {
              type: 'Lambda',
              parameters: [
                {
                  parameterName: 'LambdaArn',
                  parameterValue: kinesisFirehoseCloudwatchLogsProcessorLambda.functionArn,
                }
              ]
            },
          ]
        }
      }
    });

    cflKinesisFirehose.node.addDependency(cflKinesisFirehoseS3DestinationRole);

    //Allow KinesisFirehoseCloudwatchLogsProcessorLambda access to CflKinesisFirehose
    kinesisFirehoseCloudwatchLogsProcessorLambda.role?.attachInlinePolicy(new iam.Policy(this, 'KinesisFirehoseAccess', {
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['firehose:PutRecordBatch'],
          resources: [`arn:aws:firehose:${this.region}:${this.account}:deliverystream/${cflKinesisFirehose.deliveryStreamName}`]
        })
      ]
    }));

    //Amazon Connect Contact Flow Logs - Amazon CloudWatch log group
    const cflCloudWatchLogGroup = logs.LogGroup.fromLogGroupName(this, 'CflCloudWatchLogGroup', props.SSMParams.connectContactFlowLogsCloudWatchLogGroup);

    //Amazon CloudWatch Logs Role that provides access to the destination Amazon Kinesis Firehose
    const cflCloudWatchLogsKinesisFirehoseDestinationRole = new iam.Role(this, 'CflCloudWatchLogsKinesisFirehoseDestinationRole', {
      assumedBy: new iam.ServicePrincipal('logs.amazonaws.com', {
        conditions: {'StringEquals': {'sts:ExternalId': this.account}}
      }),
    });

    cflCloudWatchLogsKinesisFirehoseDestinationRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['firehose:PutRecord', 'firehose:PutRecordBatch'],
      resources: [`arn:aws:firehose:${this.region}:${this.account}:deliverystream/${cflKinesisFirehose.deliveryStreamName}`],
    }));

    //Amazon CloudWatch Logs subscription
    const cflSubscriptionFilter = new logs.CfnSubscriptionFilter(this, 'CflSubscriptionFilter', {
      destinationArn: cflKinesisFirehose.attrArn,
      logGroupName: cflCloudWatchLogGroup.logGroupName,
      filterPattern: '',
      roleArn: cflCloudWatchLogsKinesisFirehoseDestinationRole.roleArn,
    });
    cflSubscriptionFilter.node.addDependency(cflCloudWatchLogsKinesisFirehoseDestinationRole);

    //Create AWS Glue Table
    const cflGlueTable = new glue.CfnTable(this, 'CflGlueTable', {
      catalogId: this.account,
      databaseName: props.SSMParams.awsGlueDatabaseName.toLowerCase(),
      tableInput: {
        name: 'connect_cfl',
        tableType: 'EXTERNAL_TABLE',
        description: 'AWS Glue Table for Amazon Connect CFLs',
        parameters: {
          "classification": "json"
        },
        partitionKeys: [
          {
            name: 'year',
            type: 'int'
          },
          {
            name: 'month',
            type: 'int'
          },
          {
            name: 'day',
            type: 'int'
          }
        ],
        storageDescriptor: {
          location: `s3://${cflS3bucket.bucketName}/fhbase`,
          inputFormat: 'org.apache.hadoop.mapred.TextInputFormat',
          outputFormat: 'org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat',
          serdeInfo: {
            serializationLibrary: "org.openx.data.jsonserde.JsonSerDe",
            parameters: {
              "serialization.format": "1",
            }
          },
          compressed: false,
          columns: [
            {
              name: "timestamp",
              type: "string"
            },
            {
              name: "eventid",
              type: "string"
            },
            {
              name: "message",
              type: "string"
            },
          ],
        }
      }
    });

    //Cloudwatch Scheduled Rules
    const cflPartitioningSchedule = new events.Rule(this, 'CflPartitioningSchedule', {
      ruleName: `${props.cdkAppName}-CflPartitioningSchedule`,
      description: 'Executes CFL partitioning job (Step Functions) on a daily basis',
      schedule: events.Schedule.expression('cron(45 23 ? * * *)'),
      enabled: props.SSMParams.cflPartitioningScheduleEnabled,
    });
    cflPartitioningSchedule.addTarget(new eventTargets.SfnStateMachine(props.athenaPartitioningStateMachine, {
      input: events.RuleTargetInput.fromObject({
        s3_bucket: cflS3bucket.bucketName,
        s3_prefix: 'fhbase',
        table_name: `${props.SSMParams.awsGlueDatabaseName.toLowerCase()}.connect_cfl`,
        overridePartitionLoad: false,
      })
    }));
  }
}