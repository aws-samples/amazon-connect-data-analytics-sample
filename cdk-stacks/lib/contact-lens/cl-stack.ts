import {Duration, NestedStack, NestedStackProps, RemovalPolicy} from 'aws-cdk-lib';
import {Construct} from 'constructs';
import * as events from 'aws-cdk-lib/aws-events';
import * as eventTargets from 'aws-cdk-lib/aws-events-targets';
import * as nodeLambda from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import {SqsEventSource} from 'aws-cdk-lib/aws-lambda-event-sources';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as firehose from 'aws-cdk-lib/aws-kinesisfirehose';
import * as glue from "aws-cdk-lib/aws-glue";
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import {NagSuppressions} from "cdk-nag";

export interface CLStackProps extends NestedStackProps {
  readonly SSMParams: any;
  readonly cdkAppName: string;
  readonly clS3bucketName: string;
  readonly clS3bucketAccessLogsName: string;
  readonly athenaPartitioningStateMachine: sfn.IStateMachine;
}

//Contact Lens (CL) Stack
export class CLStack extends NestedStack {

  constructor(scope: Construct, id: string, props: CLStackProps) {
    super(scope, id, props);

    //Amazon S3 bucket to store access logs for CL
    const clS3bucketAccessLogs = new s3.Bucket(this, 'CLS3bucketAccessLogs', {
      bucketName: props.clS3bucketAccessLogsName,
      removalPolicy: RemovalPolicy.RETAIN,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_PREFERRED,
      enforceSSL: true,
      serverAccessLogsPrefix: 'logs',
    });

    //Amazon S3 bucket to store CLs
    const clS3bucket = new s3.Bucket(this, 'CLS3bucket', {
      bucketName: props.clS3bucketName,
      removalPolicy: RemovalPolicy.RETAIN,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      serverAccessLogsBucket: clS3bucketAccessLogs,
      enforceSSL: true,
      serverAccessLogsPrefix: 'logs',
    });

    //Amazon Kinesis Firehose Role that provides access to the destination Amazon S3 bucket
    const clKinesisFirehoseS3DestinationRole = new iam.Role(this, 'CLKinesisFirehoseS3DestinationRole', {
      assumedBy: new iam.ServicePrincipal('firehose.amazonaws.com', {
        conditions: {'StringEquals': {'sts:ExternalId': this.account}}
      }),
    });
    clS3bucket.grantReadWrite(clKinesisFirehoseS3DestinationRole);
    NagSuppressions.addResourceSuppressions(clKinesisFirehoseS3DestinationRole, [
      {
        id: 'AwsSolutions-IAM5',
        reason: 'It is justified because this is the intended behavior, for Kinesis to read and write to the S3 bucket and all its contents. We mitigate it by allowing read write permission to the specific Kinesis Firehose and specific S3 bucket'
      }
    ], true);

    //Amazon Kinesis Firehose
    const clKinesisFirehose = new firehose.CfnDeliveryStream(this, 'CLKinesisFirehose', {
      deliveryStreamName: `${props.cdkAppName}-CLKinesisFirehose`,
      deliveryStreamType: 'DirectPut',
      deliveryStreamEncryptionConfigurationInput: {
        keyType: 'AWS_OWNED_CMK',
      },
      extendedS3DestinationConfiguration: {
        bucketArn: clS3bucket.bucketArn,
        roleArn: clKinesisFirehoseS3DestinationRole.roleArn,
        prefix: 'fhbase/!{partitionKeyFromQuery:PartitionDateTimePrefix}/',
        errorOutputPrefix: 'fherroroutputbase-error/!{firehose:random-string}/!{firehose:error-output-type}/!{timestamp:yyy/MM/dd}/',
        bufferingHints: {
          intervalInSeconds: 60,
          sizeInMBs: 128,
        },
        dynamicPartitioningConfiguration: {
          enabled: true,
        },
        processingConfiguration: {
          enabled: true,
          processors: [
            {
              type: "MetadataExtraction",
              parameters: [
                {
                  parameterName: 'JsonParsingEngine',
                  parameterValue: 'JQ-1.6',
                },
                {
                  parameterName: 'MetadataExtractionQuery',
                  parameterValue: '{PartitionDateTimePrefix: (.recordingTimestamp[0:19] + "Z")| fromdateiso8601| strftime("year=%Y/month=%m/day=%d")}'
                },
              ]
            },
          ]
        }
      },
    });
    clKinesisFirehose.node.addDependency(clKinesisFirehoseS3DestinationRole);

    //Create AWS Glue Table
    const clGlueTable = new glue.CfnTable(this, 'CLGlueTable', {
      catalogId: this.account,
      databaseName: props.SSMParams.awsGlueDatabaseName.toLowerCase(),
      tableInput: {
        name: 'connect_cl',
        tableType: 'EXTERNAL_TABLE',
        description: 'AWS Glue Table for Amazon Connect CLs',
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
          location: `s3://${clS3bucket.bucketName}/fhbase`,
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
              name: "contactid",
              type: "string",
            },
            {
              name: "instanceid",
              type: "string",
            },
            {
              name: "recordingtimestamp",
              type: "string",
            },
            {
              name: "channel",
              type: "string",
            },
            {
              name: "languagecode",
              type: "string",
            },
            {
              name: "matchedcategories",
              type: "array<string>",
            },
            {
              name: "totalconversationduration",
              type: "int",
            },
            {
              name: "overallsentimentagent",
              type: "double",
            },
            {
              name: "overallsentimentcustomer",
              type: "double",
            },
            {
              name: "interruptionstotalcount",
              type: "int",
            },
            {
              name: "nontalktimetotal",
              type: "int",
            },
            {
              name: "averagewordsperminuteagent",
              type: "int",
            },
            {
              name: "averagewordsperminutecustomer",
              type: "int",
            },
            {
              name: "talktimetotal",
              type: "int",
            },
            {
              name: "talktimeagent",
              type: "int",
            },
            {
              name: "talktimecustomer",
              type: "int",
            },
            {
              name: "callsummary",
              type: "struct<issuesdetectedcount:int,actionitemsdetectedcount:int,outcomesdetectedcount:int>",
            },
          ]
        }
      }
    });

    //Connect Recording S3Bucket Event Notification Rule
    const connectCLS3BucketNotificationRule = new events.Rule(this, 'ConnectCLS3BucketNotificationRule', {
      ruleName: `${props.cdkAppName}-ConnectCLS3NotificationRule`,
      description: 'Triggers clEventProcessorLambda Lambda function on Amazon Connect Contact Lens output file created',
      eventPattern: {
        source: ['aws.s3'],
        detailType: ['Object Created'],
        detail: {
          bucket: {name: [props.SSMParams.connectContactLensS3BucketName]},
          object: {key: [{prefix: `Analysis/Voice/`}]},
          reason: ['PutObject'],
        }
      }
    });

    //clEventProcessor Lambda
    const clEventProcessorLambda = new nodeLambda.NodejsFunction(this, 'CLEventProcessorLambda', {
      functionName: `${props.cdkAppName}-CLEventProcessorLambda`,
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: 'lambdas/handlers/ContactLens/clEventProcessor.js',
      timeout: Duration.seconds(20),
    });
    NagSuppressions.addResourceSuppressions(clEventProcessorLambda, [
      {
        id: 'AwsSolutions-IAM4',
        reason: 'This is the default Lambda Execution Policy which just grants writes to CloudWatch.',
      }
    ], true);
    connectCLS3BucketNotificationRule.addTarget(new eventTargets.LambdaFunction(clEventProcessorLambda));

    //Dead letter queue
    const clDLQ = new sqs.Queue(this, 'CLDLQ', {
      queueName: `${props.cdkAppName}-CLDLQ`,
      retentionPeriod: Duration.days(14),
      visibilityTimeout: Duration.seconds(300),
      enforceSSL: true,
    });

    NagSuppressions.addResourceSuppressions(clDLQ, [
      {
        id: 'AwsSolutions-SQS3',
        reason: 'This is the dead letter queue.'
      },
    ]);

    //clOutputFileLoader Queue
    const clOutputFileLoaderQueue = new sqs.Queue(this, 'CLOutputFileLoaderQueue', {
      queueName: `${props.cdkAppName}-CLOutputFileLoaderQueue`,
      enforceSSL: true,
      deadLetterQueue: {
        maxReceiveCount: 3,
        queue: clDLQ,
      }
    });
    clOutputFileLoaderQueue.grantSendMessages(clEventProcessorLambda);
    clEventProcessorLambda.addEnvironment('CLOutputFileLoaderQueueURL', clOutputFileLoaderQueue.queueUrl);

    //clOutputFileLoader Lambda
    const clOutputFileLoaderLambda = new nodeLambda.NodejsFunction(this, 'CLOutputFileLoaderLambda', {
      functionName: `${props.cdkAppName}-CLOutputFileLoaderLambda`,
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: 'lambdas/handlers/ContactLens/clOutputFileLoader.js',
      timeout: Duration.seconds(20),
    });
    NagSuppressions.addResourceSuppressions(clOutputFileLoaderLambda, [
      {
        id: 'AwsSolutions-IAM4',
        reason: 'This is the default Lambda Execution Policy which just grants writes to CloudWatch.',
      }
    ], true);
    clOutputFileLoaderQueue.grantConsumeMessages(clOutputFileLoaderLambda);
    clOutputFileLoaderLambda.addEventSource(new SqsEventSource(clOutputFileLoaderQueue, {
      batchSize: 10, //default 10
      reportBatchItemFailures: true,
    }));
    const clOutputFileLoaderS3AccessInlinePolicy = new iam.Policy(this, 'CLOutputFileLoader-S3Access', {
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['s3:GetObject'],
          resources: [`arn:aws:s3:::${props.SSMParams.connectContactLensS3BucketName}/Analysis/Voice/*`]
        }),
      ]
    });
    clOutputFileLoaderLambda.role?.attachInlinePolicy(clOutputFileLoaderS3AccessInlinePolicy);
    NagSuppressions.addResourceSuppressions(clOutputFileLoaderS3AccessInlinePolicy, [
      {
        id: 'AwsSolutions-IAM5',
        reason: 'The S3 action needs permissions to the specific S3 bucket and all its contents. We mitigate it by allowing read write permission to the specific S3 bucket and all its contents',
      },
    ], true);

    //clRecordWriter Queue
    const clRecordWriterQueue = new sqs.Queue(this, 'CLRecordWriterQueue', {
      queueName: `${props.cdkAppName}-CLRecordWriterQueue`,
      enforceSSL: true,
      deadLetterQueue: {
        maxReceiveCount: 3,
        queue: clDLQ,
      }
    });
    clOutputFileLoaderLambda.addEnvironment('CLRecordWriterQueueURL', clRecordWriterQueue.queueUrl);
    clRecordWriterQueue.grantSendMessages(clOutputFileLoaderLambda);

    //clRecordWriter Lambda
    const clRecordWriterLambda = new nodeLambda.NodejsFunction(this, 'CLRecordWriterLambda', {
      functionName: `${props.cdkAppName}-CLRecordWriterLambda`,
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: 'lambdas/handlers/ContactLens/clRecordWriter.js',
      timeout: Duration.seconds(20),
      environment: {
        CLKinesisFirehoseName: `${clKinesisFirehose.deliveryStreamName}`,
      }
    });
    NagSuppressions.addResourceSuppressions(clRecordWriterLambda, [
      {
        id: 'AwsSolutions-IAM4',
        reason: 'This is the default Lambda Execution Policy which just grants writes to CloudWatch.',
      }
    ], true);
    clRecordWriterQueue.grantConsumeMessages(clRecordWriterLambda);
    clRecordWriterLambda.addEventSource(new SqsEventSource(clRecordWriterQueue, {
      batchSize: 10, //default 10
      reportBatchItemFailures: true,
    }));

    //Allow clRecordWriterLambda access to ClKinesisFirehose
    clRecordWriterLambda.role?.attachInlinePolicy(new iam.Policy(this, 'CLRecordWriterLambda-KinesisFirehoseAccess', {
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['firehose:PutRecord', 'firehose:PutRecordBatch'],
          resources: [`arn:aws:firehose:${this.region}:${this.account}:deliverystream/${clKinesisFirehose.deliveryStreamName}`]
        })
      ]
    }));

    //Cloudwatch Scheduled Rules
    const clPartitioningSchedule = new events.Rule(this, 'CLPartitioningSchedule', {
      ruleName: `${props.cdkAppName}-CLPartitioningSchedule`,
      description: 'Executes CL partitioning job (Step Functions) on a daily basis',
      schedule: events.Schedule.expression('cron(45 23 ? * * *)'),
      enabled: props.SSMParams.clPartitioningScheduleEnabled,
    });
    clPartitioningSchedule.addTarget(new eventTargets.SfnStateMachine(props.athenaPartitioningStateMachine, {
      input: events.RuleTargetInput.fromObject({
        s3_bucket: clS3bucket.bucketName,
        s3_prefix: 'fhbase',
        table_name: `${props.SSMParams.awsGlueDatabaseName.toLowerCase()}.connect_cl`,
        overridePartitionLoad: false,
      })
    }));
  }
}
