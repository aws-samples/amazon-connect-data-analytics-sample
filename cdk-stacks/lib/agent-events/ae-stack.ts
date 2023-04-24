import {NestedStack, NestedStackProps, RemovalPolicy} from 'aws-cdk-lib';
import {Construct} from 'constructs';
import * as kinesis from 'aws-cdk-lib/aws-kinesis';
import * as firehose from 'aws-cdk-lib/aws-kinesisfirehose';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as glue from "aws-cdk-lib/aws-glue";
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as events from 'aws-cdk-lib/aws-events';
import * as eventTargets from 'aws-cdk-lib/aws-events-targets';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import {NagSuppressions} from "cdk-nag";

export interface AEStackProps extends NestedStackProps {
  readonly SSMParams: any;
  readonly cdkAppName: string;
  readonly aeS3bucketName: string;
  readonly aeS3bucketAccessLogsName: string;
  readonly athenaPartitioningStateMachine: sfn.IStateMachine;
}

//Agent Events (AE) Stack
export class AEStack extends NestedStack {

  constructor(scope: Construct, id: string, props: AEStackProps) {
    super(scope, id, props);

    //Amazon S3 bucket to store access logs for AES3Bucket
    const aeS3bucketAccessLogs = new s3.Bucket(this, 'AES3bucketAccessLogs', {
      bucketName: props.aeS3bucketAccessLogsName,
      removalPolicy: RemovalPolicy.RETAIN,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_PREFERRED,
      enforceSSL: true,
      serverAccessLogsPrefix: 'logs',
    });

    //Amazon S3 bucket to store AEs
    const aeS3bucket = new s3.Bucket(this, 'AES3bucket', {
      bucketName: props.aeS3bucketName,
      removalPolicy: RemovalPolicy.RETAIN,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      serverAccessLogsBucket: aeS3bucketAccessLogs,
      enforceSSL: true,
      serverAccessLogsPrefix: 'logs',
    });

    //Amazon Connect AE Kinesis Stream
    const aeKinesisStream = new kinesis.Stream(this, 'AEKinesisStream', {
      streamName: `${props.cdkAppName}-AEKinesisStream`,
      shardCount: 1,
    });

    //Amazon Kinesis Firehose role that provides access to the source Kinesis data stream
    const aeKinesisFirehoseStreamSourceRole = new iam.Role(this, 'AEKinesisFirehoseStreamSourceRole', {
      assumedBy: new iam.ServicePrincipal('firehose.amazonaws.com', {
        conditions: {'StringEquals': {"sts:ExternalId": this.account}}
      }),
    });
    aeKinesisStream.grantRead(aeKinesisFirehoseStreamSourceRole);

    //Amazon Kinesis Firehose Role that provides access to the destination Amazon S3 bucket
    const aeKinesisFirehoseS3DestinationRole = new iam.Role(this, 'AEKinesisFirehoseS3DestinationRole', {
      assumedBy: new iam.ServicePrincipal('firehose.amazonaws.com', {
        conditions: {'StringEquals': {"sts:ExternalId": this.account}}
      }),
    });
    aeS3bucket.grantReadWrite(aeKinesisFirehoseS3DestinationRole);
    NagSuppressions.addResourceSuppressions(aeKinesisFirehoseS3DestinationRole, [
      {
        id: 'AwsSolutions-IAM5',
        reason: 'It is justified because this is the intended behavior, for Kinesis to read and write to the S3 bucket and all its contents. We mitigate it by allowing read write permission to the specific Kinesis Firehose and specific S3 bucket'
      }
    ], true);

    //Amazon Kinesis Firehose
    const aeKinesisFirehose = new firehose.CfnDeliveryStream(this, 'AEKinesisFirehose', {
      deliveryStreamName: `${props.cdkAppName}-AEKinesisFirehose`,
      deliveryStreamType: 'KinesisStreamAsSource',
      kinesisStreamSourceConfiguration: {
        kinesisStreamArn: aeKinesisStream.streamArn,
        roleArn: aeKinesisFirehoseStreamSourceRole.roleArn,
      },
      extendedS3DestinationConfiguration: {
        bucketArn: aeS3bucket.bucketArn,
        roleArn: aeKinesisFirehoseS3DestinationRole.roleArn,
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
                  parameterValue: '{PartitionDateTimePrefix: (.EventTimestamp[0:19] + "Z")|  fromdateiso8601| strftime("year=%Y/month=%m/day=%d")}'
                },
              ]
            },
            {
              type: 'AppendDelimiterToRecord',
              parameters: [
                {
                  parameterName: 'Delimiter',
                  parameterValue: '\\n',
                }
              ]
            }
          ]
        }
      }
    });
    aeKinesisFirehose.node.addDependency(aeKinesisFirehoseStreamSourceRole);
    aeKinesisFirehose.node.addDependency(aeKinesisFirehoseS3DestinationRole);
    NagSuppressions.addResourceSuppressions(aeKinesisFirehose, [
      {
        id: 'AwsSolutions-KDF1',
        reason: 'Firehose does not support encryption when being populated from a Kinesis stream. Under the current architecture, it is not possible. All the traffic is travelling within the same region and account, so it should be safe. Please reference https://docs.aws.amazon.com/firehose/latest/dev/encryption.html#sse-with-data-stream-as-source'
      },
    ]);

    //Create AWS Glue Table
    const aeGlueTable = new glue.CfnTable(this, 'AEGlueTable', {
      catalogId: this.account,
      databaseName: props.SSMParams.awsGlueDatabaseName.toLowerCase(),
      tableInput: {
        name: 'connect_ae',
        tableType: 'EXTERNAL_TABLE',
        description: 'AWS Glue Table for Amazon Connect AEs',
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
          location: `s3://${aeS3bucket.bucketName}/fhbase`,
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
              name: "awsaccountid",
              type: "string"
            },
            {
              name: "agentarn",
              type: "string"
            },
            {
              name: "currentagentsnapshot",
              type: "struct<agentstatus:struct<arn:string,name:string,starttimestamp:string,type:string>,configuration:struct<agenthierarchygroups:string,firstname:string,lastname:string,routingprofile:struct<arn:string,concurrency:array<struct<availableslots:int,channel:string,maximumslots:int>>,defaultoutboundqueue:struct<arn:string,channels:array<string>,name:string>,inboundqueues:array<struct<arn:string,channels:array<string>,name:string>>,name:string>,username:string>,contacts:array<struct<channel:string,connectedtoagenttimestamp:string,contactid:string,initialcontactid:string,initiationmethod:string,queue:struct<arn:string,name:string>,queuetimestamp:string,state:string,statestarttimestamp:string>>,nextagentstatus:string>"
            },
            {
              name: "eventid",
              type: "string"
            },
            {
              name: "eventtimestamp",
              type: "string"
            },
            {
              name: "eventtype",
              type: "string"
            },
            {
              name: "instancearn",
              type: "string"
            },
            {
              name: "previousagentsnapshot",
              type: "struct<agentstatus:struct<arn:string,name:string,starttimestamp:string,type:string>,configuration:struct<agenthierarchygroups:string,firstname:string,lastname:string,routingprofile:struct<arn:string,concurrency:array<struct<availableslots:int,channel:string,maximumslots:int>>,defaultoutboundqueue:struct<arn:string,channels:array<string>,name:string>,inboundqueues:array<struct<arn:string,channels:array<string>,name:string>>,name:string>,username:string>,contacts:array<struct<channel:string,connectedtoagenttimestamp:string,contactid:string,initialcontactid:string,initiationmethod:string,queue:struct<arn:string,name:string>,queuetimestamp:string,state:string,statestarttimestamp:string>>,nextagentstatus:string>"
            },
            {
              name: "version",
              type: "string"
            },
          ],
        }
      }
    });

    //Cloudwatch Scheduled Rules
    const aePartitioningSchedule = new events.Rule(this, 'AePartitioningSchedule', {
      ruleName: `${props.cdkAppName}-AePartitioningSchedule`,
      description: 'Executes AE partitioning job (Step Functions) on a daily basis',
      schedule: events.Schedule.expression('cron(45 23 ? * * *)'),
      enabled: props.SSMParams.aePartitioningScheduleEnabled,
    });
    aePartitioningSchedule.addTarget(new eventTargets.SfnStateMachine(props.athenaPartitioningStateMachine, {
      input: events.RuleTargetInput.fromObject({
        s3_bucket: aeS3bucket.bucketName,
        s3_prefix: 'fhbase',
        table_name: `${props.SSMParams.awsGlueDatabaseName.toLowerCase()}.connect_ae`,
        overridePartitionLoad: false,
      })
    }));
  }

}