import {Duration, NestedStack, NestedStackProps, RemovalPolicy} from 'aws-cdk-lib';
import {Construct} from 'constructs';
import * as nodeLambda from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as sfn_tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as logs from 'aws-cdk-lib/aws-logs';
import {NagSuppressions} from "cdk-nag";


export interface PartitioningStackProps extends NestedStackProps {
  readonly SSMParams: any;
  readonly cdkAppName: string;
  readonly athenaResultsS3bucketName: string;
  readonly athenaResultsS3bucketAccessLogsName: string;
  readonly ctrS3bucketName: string;
  readonly aeS3bucketName: string;
  readonly cflS3bucketName: string;
  readonly clS3bucketName: string;
  readonly efS3bucketName: string;
}

export class PartitioningStack extends NestedStack {

  public readonly athenaPartitioningStateMachine: sfn.IStateMachine;

  constructor(scope: Construct, id: string, props: PartitioningStackProps) {
    super(scope, id, props);

    //Amazon S3 bucket to store access logs for Athena Results
    const athenaResultsS3bucketAccessLogs = new s3.Bucket(this, 'AthenaResultsS3bucketAccessLogs', {
      bucketName: props.athenaResultsS3bucketAccessLogsName,
      removalPolicy: RemovalPolicy.RETAIN,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_PREFERRED,
      enforceSSL: true,
      serverAccessLogsPrefix: 'logs',
    });
    NagSuppressions.addResourceSuppressions(athenaResultsS3bucketAccessLogs, [
      {
        id: 'AwsSolutions-S1',
        reason: 'This is the access log bucket.'
      },
    ]);

    //Amazon S3 bucket to store Athena Results
    const athenaResultsS3bucket = new s3.Bucket(this, 'AthenaResultsS3bucket', {
      bucketName: `${props.cdkAppName}-ar-${this.account}-${this.region}`.toLowerCase(),
      removalPolicy: RemovalPolicy.RETAIN,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      serverAccessLogsBucket: athenaResultsS3bucketAccessLogs,
      enforceSSL: true,
      serverAccessLogsPrefix: 'logs',
    });

    const startPartitioningLambda = new nodeLambda.NodejsFunction(this, 'StartPartitioningLambda', {
      functionName: `${props.cdkAppName}-StartPartitioningLambda`,
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: 'lambdas/handlers/Partitioning/startPartitioning.js',
      timeout: Duration.seconds(180),
      environment: {
        AthenaResultsS3bucketName: athenaResultsS3bucket.bucketName,
      }
    });
    NagSuppressions.addResourceSuppressions(startPartitioningLambda, [
      {
        id: 'AwsSolutions-IAM4',
        reason: 'This is using the default AWS Lambda role, and is limited enough for our use case.',
      }
    ], true);
    startPartitioningLambda.role?.attachInlinePolicy(new iam.Policy(this, 'StartPartitioning-AthenaAccess', {
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['athena:StartQueryExecution'],
          resources: [`arn:aws:athena:${this.region}:${this.account}:workgroup/primary`]
        }),
      ]
    }));

    const startPartitioningGlueAccessInlinePolicy = new iam.Policy(this, 'StartPartitioning-GlueAccess', {
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['glue:GetTable', 'glue:UpdateTable', 'glue:GetPartitions', 'glue:CreatePartition', 'glue:UpdatePartition', 'glue:BatchCreatePartition'],
          resources: ["*"]
        }),
      ]
    });
    startPartitioningLambda.role?.attachInlinePolicy(startPartitioningGlueAccessInlinePolicy);
    NagSuppressions.addResourceSuppressions(startPartitioningGlueAccessInlinePolicy, [
      {
        id: 'AwsSolutions-IAM5',
        reason: 'The Glue actions need permissions to all of the tables. We mitigate it by allowing permission to the specific catalog and database.',
      },
    ], true);

    const startPartitioningS3AccessInlinePolicy = new iam.Policy(this, 'StartPartitioning-S3Access', {
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['s3:GetBucketLocation'],
          resources: [athenaResultsS3bucket.bucketArn]
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['s3:PutObject'],
          resources: [
            `arn:aws:s3:::${props.athenaResultsS3bucketName}/*`,
            `arn:aws:s3:::${props.ctrS3bucketName}/*`,
            `arn:aws:s3:::${props.aeS3bucketName}/*`,
            `arn:aws:s3:::${props.cflS3bucketName}/*`,
            `arn:aws:s3:::${props.clS3bucketName}/*`,
            `arn:aws:s3:::${props.efS3bucketName}/*`,
          ]
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['s3:ListBucket'],
          resources: [
            `arn:aws:s3:::${props.ctrS3bucketName}`,
            `arn:aws:s3:::${props.aeS3bucketName}`,
            `arn:aws:s3:::${props.cflS3bucketName}`,
            `arn:aws:s3:::${props.clS3bucketName}`,
            `arn:aws:s3:::${props.efS3bucketName}`,
          ]
        }),
      ]
    });
    startPartitioningLambda.role?.attachInlinePolicy(startPartitioningS3AccessInlinePolicy);
    NagSuppressions.addResourceSuppressions(startPartitioningS3AccessInlinePolicy, [
      {
        id: 'AwsSolutions-IAM5',
        reason: 'The S3 action needs permissions to the specific S3 bucket and all its contents. We mitigate it by allowing read write permission to the specific S3 bucket and all its contents',
      },
    ], true);

    const pollPartitioningStatusLambda = new nodeLambda.NodejsFunction(this, 'PollPartitioningStatusLambda', {
      functionName: `${props.cdkAppName}-PollPartitioningStatusLambda`,
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: 'lambdas/handlers/Partitioning/pollPartitioningStatus.js',
      timeout: Duration.seconds(180),
    });
    pollPartitioningStatusLambda.role?.attachInlinePolicy(new iam.Policy(this, 'PollPartitioningStatus-AthenaAccess', {
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['athena:GetQueryExecution'],
          resources: [`arn:aws:athena:${this.region}:${this.account}:workgroup/primary`]
        }),
      ]
    }));
    NagSuppressions.addResourceSuppressions(pollPartitioningStatusLambda, [
      {
        id: 'AwsSolutions-IAM4',
        reason: 'This is the default Lambda Execution Policy which just grants writes to CloudWatch.',
      }
    ], true)

    const getPartitioningResultsLambda = new nodeLambda.NodejsFunction(this, 'GetPartitioningResultsLambda', {
      functionName: `${props.cdkAppName}-GetPartitioningResultsLambda`,
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: 'lambdas/handlers/Partitioning/getPartitioningResults.js',
      timeout: Duration.seconds(180),
    });
    getPartitioningResultsLambda.role?.attachInlinePolicy(new iam.Policy(this, 'GetPartitioningResults-AthenaAccess', {
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['athena:GetQueryResults'],
          resources: [`arn:aws:athena:${this.region}:${this.account}:workgroup/primary`]
        }),
      ]
    }));
    const getPartitionResultsS3AccessInlinePolicy = new iam.Policy(this, 'GetPartitioningResults-S3Access', {
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['s3:GetObject'],
          resources: [`${athenaResultsS3bucket.bucketArn}/*`]
        }),
      ]
    });
    getPartitioningResultsLambda.role?.attachInlinePolicy(getPartitionResultsS3AccessInlinePolicy);
    NagSuppressions.addResourceSuppressions(getPartitioningResultsLambda, [
      {
        id: 'AwsSolutions-IAM4',
        reason: 'This is the default Lambda Execution Policy which just grants writes to CloudWatch.',
      }
    ], true);
    NagSuppressions.addResourceSuppressions(getPartitionResultsS3AccessInlinePolicy, [
      {
        id: 'AwsSolutions-IAM5',
        reason: 'This is the intended use case, for the Lambda to access all object in the Athena results bucket.',
      }
    ], true);

    const partitioningIteratorLambda = new nodeLambda.NodejsFunction(this, 'PartitioningIteratorLambda', {
      functionName: `${props.cdkAppName}-PartitioningIteratorLambda`,
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: 'lambdas/handlers/Partitioning/partitioningIterator.js',
      timeout: Duration.seconds(180),
    });
    NagSuppressions.addResourceSuppressions(partitioningIteratorLambda, [
      {
        id: 'AwsSolutions-IAM4',
        reason: 'This is using the default AWS Lambda role, and is limited enough for our use case.',
      }
    ], true);

    //AWS Step Functions - State Machine for Partitioning

    const pollPartitioningStatusTask = new sfn_tasks.LambdaInvoke(this, 'PollPartitioningStatusTask', {
      lambdaFunction: pollPartitioningStatusLambda,
      payloadResponseOnly: true,
      retryOnServiceExceptions: true,
      resultPath: '$.result',
    });

    const partitioningWaitNext = new sfn.Wait(this, 'PartitioningWaitNext', {
      time: sfn.WaitTime.secondsPath('$.result.waitTime')
    });

    const startPartitioningTask = new sfn_tasks.LambdaInvoke(this, 'StartPartitioningTask', {
      lambdaFunction: startPartitioningLambda,
      payloadResponseOnly: true,
      retryOnServiceExceptions: true,
      resultPath: '$.result',
    });

    const partitioningIteratorWait = new sfn.Wait(this, 'PartitioningIteratorWait', {
      time: sfn.WaitTime.secondsPath('$.iterator.iteratorWaitCurrent')
    });

    const partitioningIteratorTask = new sfn_tasks.LambdaInvoke(this, 'PartitioningIteratorTask', {
      lambdaFunction: partitioningIteratorLambda,
      payloadResponseOnly: true,
      retryOnServiceExceptions: true,
      resultPath: '$.iterator',
    });

    const getPartitioningResultTask = new sfn_tasks.LambdaInvoke(this, 'GetPartitioningResultTask', {
      lambdaFunction: getPartitioningResultsLambda,
      payloadResponseOnly: true,
      retryOnServiceExceptions: true,
    });

    const partitioningConfigureCount = new sfn.Pass(this, 'PartitioningConfigureCount', {
      result: {
        value: {
          count: 5,
          index: -1,
          step: 1,
          iteratorWaitInit: 10,
          iteratorWaitCurrent: 0
        }
      },
      resultPath: '$.iterator'
    });

    const partitioningQueryFailed = new sfn.Fail(this, 'PartitioningQueryFailed', {
      cause: 'Athena query execution failed',
      error: 'Athena query execution failed'
    });

    //Define log group for state machine
    const athenaPartitioningLogGroup = new logs.LogGroup(this, 'AthenaPartitioningLogGroup');

    const athenaPartitioningStateMachine = new sfn.StateMachine(this, 'AthenaPartitioningStateMachine', {
      stateMachineName: `${props.cdkAppName}-AthenaPartitioningStateMachine`,
      definition: sfn.Chain.start(
        partitioningConfigureCount
          .next(partitioningIteratorTask)
          .next(
            new sfn.Choice(this, 'PartitioningIsCountReached')
              .when(sfn.Condition.booleanEquals('$.iterator.continue', true), partitioningIteratorWait.next(
                startPartitioningTask.next(
                  partitioningWaitNext.next(
                    pollPartitioningStatusTask.next(
                      new sfn.Choice(this, 'PartitioningCheckComplete')
                        .when(sfn.Condition.stringEquals('$.result.status', 'FAILED'), partitioningIteratorTask)
                        .when(sfn.Condition.stringEquals('$.result.status', 'SUCCEEDED'), getPartitioningResultTask)
                        .otherwise(partitioningWaitNext)
                    )
                  )
                )
              ))
              .otherwise(partitioningQueryFailed)
          )
      ),
      logs: {
        destination: athenaPartitioningLogGroup,
        level: sfn.LogLevel.ALL
      },
      tracingEnabled: true,
    });
    NagSuppressions.addResourceSuppressions(athenaPartitioningStateMachine, [
      {
        id: 'AwsSolutions-IAM5',
        reason: 'This is the default State Machine Execution Policy which just grants the state machine start execution permissions.',
      },
    ], true);
    this.athenaPartitioningStateMachine = athenaPartitioningStateMachine;
  }
}