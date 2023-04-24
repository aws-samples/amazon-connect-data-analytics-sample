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

export interface EFStackProps extends NestedStackProps {
  readonly SSMParams: any;
  readonly cdkAppName: string;
  readonly efS3bucketName: string;
  readonly efS3bucketAccessLogsName: string;
  readonly athenaPartitioningStateMachine: sfn.IStateMachine;
}

//Evaluation Forms (EF) Stack
export class EFStack extends NestedStack {
  constructor(scope: Construct, id: string, props: EFStackProps) {
    super(scope, id, props);

    //Amazon S3 bucket to store access logs for EF
    const efS3bucketAccessLogs = new s3.Bucket(this, 'EFS3bucketAccessLogs', {
      bucketName: props.efS3bucketAccessLogsName,
      removalPolicy: RemovalPolicy.RETAIN,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_PREFERRED,
      enforceSSL: true,
      serverAccessLogsPrefix: 'logs',
    });

    //Amazon S3 bucket to store EFs
    const efS3bucket = new s3.Bucket(this, 'EFS3bucket', {
      bucketName: props.efS3bucketName,
      removalPolicy: RemovalPolicy.RETAIN,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      serverAccessLogsBucket: efS3bucketAccessLogs,
      enforceSSL: true,
      serverAccessLogsPrefix: 'logs',
    });

    //Amazon Kinesis Firehose Role that provides access to the destination Amazon S3 bucket
    const efKinesisFirehoseS3DestinationRole = new iam.Role(this, 'EFKinesisFirehoseS3DestinationRole', {
      assumedBy: new iam.ServicePrincipal('firehose.amazonaws.com', {
        conditions: {'StringEquals': {'sts:ExternalId': this.account}}
      }),
    });
    efS3bucket.grantReadWrite(efKinesisFirehoseS3DestinationRole);
    NagSuppressions.addResourceSuppressions(efKinesisFirehoseS3DestinationRole, [
      {
        id: 'AwsSolutions-IAM5',
        reason: 'The S3 action needs permissions to the specific S3 bucket and all its contents. We mitigate it by allowing read write permission to the specific S3 bucket and all its contents',
      },
    ], true);

    //Amazon Kinesis Firehose
    const efKinesisFirehose = new firehose.CfnDeliveryStream(this, 'EFKinesisFirehose', {
      deliveryStreamName: `${props.cdkAppName}-EFKinesisFirehose`,
      deliveryStreamType: 'DirectPut',
      deliveryStreamEncryptionConfigurationInput: {
        keyType: 'AWS_OWNED_CMK',
      },
      extendedS3DestinationConfiguration: {
        bucketArn: efS3bucket.bucketArn,
        roleArn: efKinesisFirehoseS3DestinationRole.roleArn,
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
                  parameterValue: '{PartitionDateTimePrefix: (.evaluationSubmitTimestamp[0:19] + "Z")| fromdateiso8601| strftime("year=%Y/month=%m/day=%d")}'
                },
              ]
            },
          ]
        }
      },
    });
    efKinesisFirehose.node.addDependency(efKinesisFirehoseS3DestinationRole);

    //Create AWS Glue Table
    const efGlueTable = new glue.CfnTable(this, 'EFGlueTable', {
      catalogId: this.account,
      databaseName: props.SSMParams.awsGlueDatabaseName.toLowerCase(),
      tableInput: {
        name: 'connect_ef',
        tableType: 'EXTERNAL_TABLE',
        description: 'AWS Glue Table for Amazon Connect EFs',
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
          location: `s3://${efS3bucket.bucketName}/fhbase`,
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
              name: "evaluationid",
              type: "string"
            },
            {
              name: "contactid",
              type: "string"
            },
            {
              name: "instanceid",
              type: "string"
            },
            {
              name: "agentid",
              type: "string"
            },
            {
              name: "evaluationdefinitiontitle",
              type: "string"
            },
            {
              name: "evaluator",
              type: "string"
            },
            {
              name: "evaluationstarttimestamp",
              type: "string"
            },
            {
              name: "evaluationsubmittimestamp",
              type: "string"
            },
            {
              name: "evaluationquestionanswers",
              type: "array<struct<questionrefid:string,sectionrefid:string,sectiontitle:string,parentsectionrefid:string,parentsectiontitle:string,fullsectiontitle:string,questiontype:string,questiontext:string,questionanswervalue:string,questionanswervaluerefid:string,questionanswerscorepercentage:float>>"
            },
            {
              name: "evaluationsectionsscores",
              type: "array<struct<sectionrefid:string,sectiontitle:string,sectionscorepercentage:float>>"
            },
            {
              name: "evaluationformtotalscorepercentage",
              type: "float"
            }
          ]
        }
      }
    });

    //Connect Recording S3Bucket Event Notification Rule

    //Parse out bucket name from the bucket path
    const connectEvaluationFormsS3BucketName = props.SSMParams.connectEvaluationFormsS3Location.slice(0, props.SSMParams.connectEvaluationFormsS3Location.indexOf("/"));
    //parse out bucket prefix from the bucket path
    const connectEvaluationFormsS3BucketPrefix = props.SSMParams.connectEvaluationFormsS3Location.slice(props.SSMParams.connectEvaluationFormsS3Location.indexOf("/") + 1, props.SSMParams.connectEvaluationFormsS3Location.length) + "/"

    const connectEFS3BucketNotificationRule = new events.Rule(this, 'ConnectEFS3BucketNotificationRule', {
      ruleName: `${props.cdkAppName}-ConnectEFS3NotificationRule`,
      description: 'Triggers efEventProcessorLambda Lambda function on Amazon Connect Evaluation Forms output file created',
      eventPattern: {
        source: ['aws.s3'],
        detailType: ['Object Created'],
        detail: {
          bucket: {name: [connectEvaluationFormsS3BucketName]},
          object: {key: [{prefix: connectEvaluationFormsS3BucketPrefix}]},
          reason: ['PutObject'],
        }
      }
    });

    //efEventProcessor Lambda
    const efEventProcessorLambda = new nodeLambda.NodejsFunction(this, 'EFEventProcessorLambda', {
      functionName: `${props.cdkAppName}-EFEventProcessorLambda`,
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: 'lambdas/handlers/EvaluationForms/efEventProcessor.js',
      timeout: Duration.seconds(20),
    });
    NagSuppressions.addResourceSuppressions(efEventProcessorLambda, [
      {
        id: 'AwsSolutions-IAM4',
        reason: 'This is the default Lambda Execution Policy which just grants writes to CloudWatch.',
      }
    ], true);
    connectEFS3BucketNotificationRule.addTarget(new eventTargets.LambdaFunction(efEventProcessorLambda));

    //Dead letter queue
    const efDLQ = new sqs.Queue(this, 'EFDLQ', {
      queueName: `${props.cdkAppName}-EFDLQ`,
      retentionPeriod: Duration.days(14),
      visibilityTimeout: Duration.seconds(300),
      enforceSSL: true,
    });

    NagSuppressions.addResourceSuppressions(efDLQ, [
      {
        id: 'AwsSolutions-SQS3',
        reason: 'This is the dead letter queue.'
      },
    ]);

    //efOutputFileLoader Queue
    const efOutputFileLoaderQueue = new sqs.Queue(this, 'EFOutputFileLoaderQueue', {
      queueName: `${props.cdkAppName}-EFOutputFileLoaderQueue`,
      enforceSSL: true,
      deadLetterQueue: {
        maxReceiveCount: 3,
        queue: efDLQ,
      }
    });
    efOutputFileLoaderQueue.grantSendMessages(efEventProcessorLambda);
    efEventProcessorLambda.addEnvironment('EFOutputFileLoaderQueueURL', efOutputFileLoaderQueue.queueUrl);

    //efOutputFileLoader Lambda
    const efOutputFileLoaderLambda = new nodeLambda.NodejsFunction(this, 'EFOutputFileLoaderLambda', {
      functionName: `${props.cdkAppName}-EFOutputFileLoaderLambda`,
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: 'lambdas/handlers/EvaluationForms/efOutputFileLoader.js',
      timeout: Duration.seconds(20),
    });
    NagSuppressions.addResourceSuppressions(efOutputFileLoaderLambda, [
      {
        id: 'AwsSolutions-IAM4',
        reason: 'This is the default Lambda Execution Policy which just grants writes to CloudWatch.',
      }
    ], true);
    efOutputFileLoaderQueue.grantConsumeMessages(efOutputFileLoaderLambda);
    efOutputFileLoaderLambda.addEventSource(new SqsEventSource(efOutputFileLoaderQueue, {
      batchSize: 10, //default 10
      reportBatchItemFailures: true,
    }));

    const efOutputFileLoaderInlinePolicy = new iam.Policy(this, 'EFOutputFileLoader-S3Access', {
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['s3:GetObject', 's3:ListBucket'],
          resources: [`arn:aws:s3:::${connectEvaluationFormsS3BucketName}/*`]
        }),
      ]
    });
    efOutputFileLoaderLambda.role?.attachInlinePolicy(efOutputFileLoaderInlinePolicy);
    NagSuppressions.addResourceSuppressions(efOutputFileLoaderInlinePolicy, [
      {
        id: 'AwsSolutions-IAM5',
        reason: 'The S3 action needs permissions to the specific S3 bucket and all its contents. We mitigate it by allowing read write permission to the specific S3 bucket and all its contents',
      },
    ], true);

    //efRecordWriter Queue
    const efRecordWriterQueue = new sqs.Queue(this, 'EFRecordWriterQueue', {
      queueName: `${props.cdkAppName}-EFRecordWriterQueue`,
      enforceSSL: true,
      deadLetterQueue: {
        maxReceiveCount: 3,
        queue: efDLQ,
      }
    });
    efOutputFileLoaderLambda.addEnvironment('EFRecordWriterQueueURL', efRecordWriterQueue.queueUrl);
    efRecordWriterQueue.grantSendMessages(efOutputFileLoaderLambda);

    //efRecordWriter Lambda
    const efRecordWriterLambda = new nodeLambda.NodejsFunction(this, 'EFRecordWriterLambda', {
      functionName: `${props.cdkAppName}-EFRecordWriterLambda`,
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: 'lambdas/handlers/EvaluationForms/efRecordWriter.js',
      timeout: Duration.seconds(20),
      environment: {
        EFKinesisFirehoseName: `${efKinesisFirehose.deliveryStreamName}`,
      }
    });
    NagSuppressions.addResourceSuppressions(efRecordWriterLambda, [
      {
        id: 'AwsSolutions-IAM4',
        reason: 'This is the default Lambda Execution Policy which just grants writes to CloudWatch.',
      }
    ], true);
    efRecordWriterQueue.grantConsumeMessages(efRecordWriterLambda);
    efRecordWriterLambda.addEventSource(new SqsEventSource(efRecordWriterQueue, {
      batchSize: 10, //default 10
      reportBatchItemFailures: true,
    }));

    //Allow efRecordWriterLambda access to EfKinesisFirehose
    efRecordWriterLambda.role?.attachInlinePolicy(new iam.Policy(this, 'EFRecordWriterLambda-KinesisFirehoseAccess', {
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['firehose:PutRecord', 'firehose:PutRecordBatch'],
          resources: [`arn:aws:firehose:${this.region}:${this.account}:deliverystream/${efKinesisFirehose.deliveryStreamName}`]
        })
      ]
    }));

    //Cloudwatch Scheduled Rules
    const efPartitioningSchedule = new events.Rule(this, 'EFPartitioningSchedule', {
      ruleName: `${props.cdkAppName}-EFPartitioningSchedule`,
      description: 'Executes EF partitioning job (Step Functions) on a daily basis',
      schedule: events.Schedule.expression('cron(45 23 ? * * *)'),
      enabled: props.SSMParams.efPartitioningScheduleEnabled,
    });
    efPartitioningSchedule.addTarget(new eventTargets.SfnStateMachine(props.athenaPartitioningStateMachine, {
      input: events.RuleTargetInput.fromObject({
        s3_bucket: efS3bucket.bucketName,
        s3_prefix: 'fhbase',
        table_name: `${props.SSMParams.awsGlueDatabaseName.toLowerCase()}.connect_ef`,
        overridePartitionLoad: false,
      })
    }));
  }
}