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
import {NagSuppressions} from 'cdk-nag'


export interface CTRStackProps extends NestedStackProps {
  readonly SSMParams: any;
  readonly cdkAppName: string;
  readonly ctrS3bucketName: string;
  readonly ctrS3bucketAccessLogsName: string;
  readonly athenaPartitioningStateMachine: sfn.IStateMachine;
}

//Contact Trace Records (CTR) Stack
export class CTRStack extends NestedStack {

  constructor(scope: Construct, id: string, props: CTRStackProps) {
    super(scope, id, props);

    //Amazon S3 bucket to store access logs for CtrS3bucket
    const ctrS3bucketAccessLogs = new s3.Bucket(this, 'CtrS3bucketAccessLogs', {
      bucketName: props.ctrS3bucketAccessLogsName,
      removalPolicy: RemovalPolicy.RETAIN,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_PREFERRED,
      enforceSSL: true,
      serverAccessLogsPrefix: 'logs',
    });

    //Amazon S3 bucket to store CTRs
    const ctrS3bucket = new s3.Bucket(this, 'CtrS3bucket', {
      bucketName: props.ctrS3bucketName,
      removalPolicy: RemovalPolicy.RETAIN,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      serverAccessLogsBucket: ctrS3bucketAccessLogs,
      enforceSSL: true,
      serverAccessLogsPrefix: 'logs',
    });

    //Amazon Connect CTR Kinesis Stream
    const ctrKinesisStream = new kinesis.Stream(this, 'CTRKinesisStream', {
      streamName: `${props.cdkAppName}-CTRKinesisStream`,
      shardCount: 1,
    });

    //Amazon Kinesis Firehose Role that provides access to the source Kinesis data stream
    const ctrKinesisFirehoseStreamSourceRole = new iam.Role(this, 'CtrKinesisFirehoseStreamSourceRole', {
      assumedBy: new iam.ServicePrincipal('firehose.amazonaws.com', {
        conditions: {'StringEquals': {"sts:ExternalId": this.account}}
      }),
    });
    ctrKinesisStream.grantRead(ctrKinesisFirehoseStreamSourceRole);

    //Amazon Kinesis Firehose Role that provides access to the destination Amazon S3 bucket
    const ctrKinesisFirehoseS3DestinationRole = new iam.Role(this, 'CtrKinesisFirehoseS3DestinationRole', {
      assumedBy: new iam.ServicePrincipal('firehose.amazonaws.com', {
        conditions: {'StringEquals': {"sts:ExternalId": this.account}}
      }),
    });
    ctrS3bucket.grantReadWrite(ctrKinesisFirehoseS3DestinationRole);
    NagSuppressions.addResourceSuppressions(ctrKinesisFirehoseS3DestinationRole, [
      {
        id: 'AwsSolutions-IAM5',
        reason: 'It is justified because this is the intended behavior, for Kinesis to read and write to the S3 bucket and all its contents. We mitigate it by allowing read write permission to the specific Kinesis Firehose and specific S3 bucket'
      }
    ], true);

    //Amazon Kinesis Firehose
    const ctrKinesisFirehose = new firehose.CfnDeliveryStream(this, 'CtrKinesisFirehose', {
      deliveryStreamName: `${props.cdkAppName}-CtrKinesisFirehose`,
      deliveryStreamType: 'KinesisStreamAsSource',
      kinesisStreamSourceConfiguration: {
        kinesisStreamArn: ctrKinesisStream.streamArn,
        roleArn: ctrKinesisFirehoseStreamSourceRole.roleArn,
      },
      extendedS3DestinationConfiguration: {
        bucketArn: ctrS3bucket.bucketArn,
        roleArn: ctrKinesisFirehoseS3DestinationRole.roleArn,
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
                  parameterValue: '{PartitionDateTimePrefix: .InitiationTimestamp| fromdateiso8601| strftime("year=%Y/month=%m/day=%d")}'
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
    ctrKinesisFirehose.node.addDependency(ctrKinesisFirehoseStreamSourceRole);
    ctrKinesisFirehose.node.addDependency(ctrKinesisFirehoseS3DestinationRole);
    NagSuppressions.addResourceSuppressions(ctrKinesisFirehose, [
      {
        id: 'AwsSolutions-KDF1',
        reason: 'Firehose does not support encryption when being populated from a Kinesis stream. Under the current architecture, it is not possible. All the traffic is travelling within the same region and account, so it should be safe.'
      },
    ]);

    //Create AWS Glue Table
    const ctrGlueTable = new glue.CfnTable(this, 'CtrGlueTable', {
      catalogId: this.account,
      databaseName: props.SSMParams.awsGlueDatabaseName.toLowerCase(),
      tableInput: {
        name: 'connect_ctr',
        tableType: 'EXTERNAL_TABLE',
        description: 'AWS Glue Table for Amazon Connect CTRs',
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
          location: `s3://${ctrS3bucket.bucketName}/fhbase`,
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
              type: "string",
            },
            {
              name: "awscontacttracerecordformatversion",
              type: "string",
            },
            {
              name: "agent",
              type: "struct<arn:string,aftercontactworkduration:int,aftercontactworkendtimestamp:string,aftercontactworkstarttimestamp:string,agentinteractionduration:int,connectedtoagenttimestamp:string,customerholdduration:int,hierarchygroups:string,longestholdduration:int,numberofholds:int,routingprofile:struct<arn:string,name:string>,username:string>"
            },
            {
              name: "agentconnectionattempts",
              type: "int"
            },
            {
              name: "answeringmachinedetectionstatus",
              type: "string"
            },
            {
              name: "attributes",
              type: "string"
            },
            {
              name: "campaign",
              type: "struct<campaignid:string>"
            },
            {
              name: "channel",
              type: "string",
            },
            {
              name: "connectedtosystemtimestamp",
              type: "string"
            },
            {
              name: "contactdetails",
              type: "string"
            },
            {
              name: "contactid",
              type: "string"
            },
            {
              name: "customerendpoint",
              type: "struct<address:string,type:string>"
            },
            {
              name: "disconnectreason",
              type: "string"
            },
            {
              name: "disconnecttimestamp",
              type: "string"
            },
            {
              name: "initialcontactid",
              type: "string"
            },
            {
              name: "initiationmethod",
              type: "string"
            },
            {
              name: "initiationtimestamp",
              type: "string"
            },
            {
              name: "instancearn",
              type: "string"
            },
            {
              name: "lastupdatetimestamp",
              type: "string"
            },
            {
              name: "mediastreams",
              type: "array<struct<type:string>>"
            },
            {
              name: "nextcontactid",
              type: "string"
            },
            {
              name: "previouscontactid",
              type: "string"
            },
            {
              name: "queue",
              type: "struct<arn:string,dequeuetimestamp:string,duration:int,enqueuetimestamp:string,name:string>"
            },
            {
              name: "recording",
              type: "struct<deletionreason:string,location:string,status:string,type:string>"
            },
            {
              name: "recordings",
              type: "array<struct<deletionreason:string,fragmentstartnumber:string,fragmentstopnumber:string,location:string,mediastreamtype:string,participanttype:string,starttimestamp:string,status:string,stoptimestamp:string,storagetype:string>>"
            },
            {
              name: "references",
              type: "array<string>"
            },
            {
              name: "scheduledtimestamp",
              type: "string"
            },
            {
              name: "systemendpoint",
              type: "struct<address:string,type:string>"
            },
            {
              name: "transfercompletedtimestamp",
              type: "string"
            },
            {
              name: "transferredtoendpoint",
              type: "struct<address:string,type:string>"
            },
            {
              name: "voiceidresult",
              type: "string"
            },

          ],
        }
      }
    });

    //Cloudwatch Scheduled Rules
    const ctrPartitioningSchedule = new events.Rule(this, 'CtrPartitioningSchedule', {
      ruleName: `${props.cdkAppName}-CtrPartitioningSchedule`,
      description: 'Executes CTR partitioning job (Step Functions) on a daily basis',
      schedule: events.Schedule.expression('cron(45 23 ? * * *)'),
      enabled: props.SSMParams.ctrPartitioningScheduleEnabled,
    });
    ctrPartitioningSchedule.addTarget(new eventTargets.SfnStateMachine(props.athenaPartitioningStateMachine, {
      input: events.RuleTargetInput.fromObject({
        s3_bucket: ctrS3bucket.bucketName,
        s3_prefix: 'fhbase',
        table_name: `${props.SSMParams.awsGlueDatabaseName.toLowerCase()}.connect_ctr`,
        overridePartitionLoad: false,
      })
    }));
  }
}
