import {NestedStack, NestedStackProps} from 'aws-cdk-lib';
import {Construct} from 'constructs';
import * as glue from "aws-cdk-lib/aws-glue";

export interface EFReportingStackProps extends NestedStackProps {
  readonly SSMParams: any;
}

//Evaluation Forms Reporting (EF Reporting) Stack
export class EFReportingStack extends NestedStack {
  constructor(scope: Construct, id: string, props: EFReportingStackProps) {
    super(scope, id, props);
    //The ef-reporting-stack deploys six (6) virtual views. We create the view resources by passing in an encoded Presto view. The method to create this follows the same pattern:
    //1. Write the query as a string
    //2. Wrap the query in a stringified JSON object. The query value is assigned to the key "originalSql"
    //3. Encode the stringified JSON using base64
    //4. Add the prefix "/* Presto View: " (with a space after :) and also the suffix "*/ " (with a space before *)
    // The final result is passed into tableInput.viewOriginalText

    //Create the view connect_ctr_denormalized
    const connectCtrDenormalizedQuery =
      `SELECT awsaccountid,
              awscontacttracerecordformatversion,
              agent.arn                            agent_arn,
              agent.aftercontactworkduration       agent_aftercontactworkduration,
              agent.aftercontactworkendtimestamp   agent_aftercontactworkendtimestamp,
              agent.aftercontactworkstarttimestamp agent_aftercontactworkstarttimestamp,
              agent.agentinteractionduration       agent_agentinteractionduration,
              agent.connectedtoagenttimestamp      agent_connectedtoagenttimestamp,
              agent.customerholdduration           agent_customerholdduration,
              agent.hierarchygroups                agent_hierarchygroups,
              agent.longestholdduration            agent_longestholdduration,
              agent.numberofholds                  agent_numberofholds,
              agent.routingprofile.name            agent_routingprofile_name,
              agent.username                       agent_username,
              agentconnectionattempts,
              campaign.campaignid                  campaign_id,
              channel,
              connectedtosystemtimestamp,
              contactid,
              customerendpoint.address             customerendpoint_address,
              customerendpoint.type                customerendpoint_type,
              disconnectreason,
              disconnecttimestamp,
              initialcontactid,
              initiationmethod,
              initiationtimestamp,
              instancearn,
              lastupdatetimestamp,
              nextcontactid,
              previouscontactid,
              scheduledtimestamp,
              systemendpoint.address               systemendpoint_address,
              systemendpoint.type                  systemendpoint_type,
              transfercompletedtimestamp,
              transferredtoendpoint.address        transferredtoendpoint_address,
              transferredtoendpoint.type           transferredtoendpoint_type,
              queue.arn                            queue_arn,
              queue.name                           queue_name,
              queue.enqueuetimestamp               queue_enqueuetimestamp,
              queue.dequeuetimestamp               queue_dequeuetimestamp,
              queue.duration                       queue_duration,
              recording.type                       recording_type,
              recording.status                     recording_status,
              recording.location                   recording_location,
              recording.deletionreason             recording_deletionreason, year, month, day
       FROM ${props.SSMParams.awsGlueDatabaseName.toLowerCase()}."connect_ctr"`;

    const connectCtrDenormalizedQueryJson = JSON.stringify({"originalSql": connectCtrDenormalizedQuery});

    const connectCtrDenormalizedEncodedView = Buffer.from(connectCtrDenormalizedQueryJson).toString('base64');

    const connectCtrDenormalizedPrestoView = `/* Presto View: ${connectCtrDenormalizedEncodedView} */`;

    const connectCtrDenormalizedView = new glue.CfnTable(this, 'ConnectCtrDenormalizedView', {
      catalogId: this.account,
      databaseName: props.SSMParams.awsGlueDatabaseName.toLowerCase(),
      tableInput: {
        name: 'connect_ctr_denormalized',
        tableType: 'VIRTUAL_VIEW',
        description: 'Expand JSON table fields connect_ctr.agent and connect_ctr.queue structure multi row to get agent name, routing profile, channel and queue data for report filters. Used in Quicksight Dataset.',
        viewOriginalText: connectCtrDenormalizedPrestoView,
        parameters: {
          presto_view: 'true',
        },
        viewExpandedText: "/* Presto View */",
        storageDescriptor: {
          columns: [
            {
              name: "awsaccountid",
              type: "string"
            },
            {
              name: "awscontacttracerecordformatversion",
              type: "string"
            },
            {
              name: "agent_arn",
              type: "string"
            },
            {
              name: "agent_aftercontactworkduration",
              type: "int"
            },
            {
              name: "agent_aftercontactworkendtimestamp",
              type: "string"
            },
            {
              name: "agent_aftercontactworkstarttimestamp",
              type: "string"
            },
            {
              name: "agent_agentinteractionduration",
              type: "int"
            },
            {
              name: "agent_connectedtoagenttimestamp",
              type: "string"
            },
            {
              name: "agent_customerholdduration",
              type: "int"
            },
            {
              name: "agent_hierarchygroups",
              type: "string"
            },
            {
              name: "agent_longestholdduration",
              type: "int"
            },
            {
              name: "agent_numberofholds",
              type: "int"
            },
            {
              name: "agent_routingprofile_name",
              type: "string"
            },
            {
              name: "agent_username",
              type: "string"
            },
            {
              name: "agentconnectionattempts",
              type: "int"
            },
            {
              name: "campaign_id",
              type: "string"
            },
            {
              name: "channel",
              type: "string"
            },
            {
              name: "connectedtosystemtimestamp",
              type: "string"
            },
            {
              name: "contactid",
              type: "string"
            },
            {
              name: "customerendpoint_address",
              type: "string"
            },
            {
              name: "customerendpoint_type",
              type: "string"
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
              name: "nextcontactid",
              type: "string"
            },
            {
              name: "previouscontactid",
              type: "string"
            },
            {
              name: "scheduledtimestamp",
              type: "string"
            },
            {
              name: "systemendpoint_address",
              type: "string"
            },
            {
              name: "systemendpoint_type",
              type: "string"
            },
            {
              name: "transfercompletedtimestamp",
              type: "string"
            },
            {
              name: "transferredtoendpoint_address",
              type: "string"
            },
            {
              name: "transferredtoendpoint_type",
              type: "string"
            },
            {
              name: "queue_arn",
              type: "string"
            },
            {
              name: "queue_name",
              type: "string"
            },
            {
              name: "queue_enqueuetimestamp",
              type: "string"
            },
            {
              name: "queue_dequeuetimestamp",
              type: "string"
            },
            {
              name: "queue_duration",
              type: "int"
            },
            {
              name: "recording_type",
              type: "string"
            },
            {
              name: "recording_status",
              type: "string"
            },
            {
              name: "recording_location",
              type: "string"
            },
            {
              name: "recording_deletionreason",
              type: "string"
            },
            {
              name: "year",
              type: "int"
            },
            {
              name: "month",
              type: "int"
            },
            {
              name: "day",
              type: "int"
            }
          ],
          location: "",
          numberOfBuckets: 0,
          serdeInfo: {},
          storedAsSubDirectories: false,
        },
      }
    });

    //connect_ef_evaluationquestionanswers_view
    const connectEfEvaluationQuestionAnswersQuery =
      `SELECT evaluationId,
              contactid,
              instanceid,
              agentid,
              evaluationdefinitiontitle,
              evaluator,
              evaluationstarttimestamp,
              evaluationsubmittimestamp,
              evaluationformtotalscorepercentage,
              evaluationquestionanswers_MAIN.questionrefid,
              evaluationquestionanswers_MAIN.sectionrefid,
              evaluationquestionanswers_MAIN.sectiontitle,
              evaluationquestionanswers_MAIN.parentsectionrefid,
              evaluationquestionanswers_MAIN.questiontext,
              evaluationquestionanswers_MAIN.questionanswervalue,
              evaluationquestionanswers_MAIN.questionanswervaluerefid,
              evaluationquestionanswers_MAIN.questionanswerscorepercentage
       FROM (${props.SSMParams.awsGlueDatabaseName.toLowerCase()}."connect_ef" CROSS JOIN UNNEST(evaluationquestionanswers) t (evaluationquestionanswers_MAIN))`;

    const connectEfEvaluationQuestionAnswersQueryJson = JSON.stringify({"originalSql": connectEfEvaluationQuestionAnswersQuery});

    const connectEfEvaluationQuestionAnswersEncodedView = Buffer.from(connectEfEvaluationQuestionAnswersQueryJson).toString('base64');

    const connectEfEvaluationQuestionAnswersPrestoView = `/* Presto View: ${connectEfEvaluationQuestionAnswersEncodedView} */`;

    const connectEfEvaluationQuestionAnswersView = new glue.CfnTable(this, 'ConnectEfEvaluationQuestionAnswersView', {
      catalogId: this.account,
      databaseName: props.SSMParams.awsGlueDatabaseName.toLowerCase(),
      tableInput: {
        name: 'connect_ef_evaluationquestionanswers_view',
        tableType: 'VIRTUAL_VIEW',
        description: 'Unnest JSON table connect_ef.evaluationquestionanswers array structure',
        viewOriginalText: connectEfEvaluationQuestionAnswersPrestoView,
        parameters: {
          presto_view: 'true',
        },
        viewExpandedText: "/* Presto View */",
        storageDescriptor: {
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
              name: "evaluationformtotalscorepercentage",
              type: "float"
            },
            {
              name: "questionrefid",
              type: "string"
            },
            {
              name: "sectionrefid",
              type: "string"
            },
            {
              name: "sectiontitle",
              type: "string"
            },
            {
              name: "parentsectionrefid",
              type: "string"
            },
            {
              name: "questiontext",
              type: "string"
            },
            {
              name: "questionanswervalue",
              type: "string"
            },
            {
              name: "questionanswervaluerefid",
              type: "string"
            },
            {
              name: "questionanswerscorepercentage",
              type: "float"
            }
          ],
          location: "",
          numberOfBuckets: 0,
          serdeInfo: {},
          storedAsSubDirectories: false,
        },
      }
    });

    //connect_ef_evaluationsall_view
    const connectEfEvaluationsAllQuery =
      `SELECT DISTINCT connect_ef_evaluationquestionanswers_view.evaluationId,
                       connect_ef_evaluationquestionanswers_view.contactid,
                       connect_ef_evaluationquestionanswers_view.instanceid,
                       connect_ef_evaluationquestionanswers_view.agentid,
                       connect_ef_evaluationquestionanswers_view.evaluationdefinitiontitle,
                       connect_ef_evaluationquestionanswers_view.evaluator,
                       connect_ef_evaluationquestionanswers_view.evaluationstarttimestamp,
                       connect_ef_evaluationquestionanswers_view.evaluationsubmittimestamp,
                       connect_ef_evaluationquestionanswers_view.evaluationformtotalscorepercentage,
                       connect_ef_evaluationquestionanswers_view.questionrefid,
                       connect_ef_evaluationquestionanswers_view.sectionrefid,
                       connect_ef_evaluationquestionanswers_view.sectiontitle,
                       connect_ef_evaluationquestionanswers_view.parentsectionrefid,
                       connect_ef_evaluationquestionanswers_view.questiontext,
                       connect_ef_evaluationquestionanswers_view.questionanswervalue,
                       connect_ef_evaluationquestionanswers_view.questionanswervaluerefid,
                       connect_ef_evaluationquestionanswers_view.questionanswerscorepercentage
       FROM (${props.SSMParams.awsGlueDatabaseName.toLowerCase()}."connect_ef_evaluationquestionanswers_view" RIGHT JOIN ${props.SSMParams.awsGlueDatabaseName.toLowerCase()}."connect_ef_evaluationsectionsscores_view" ON (
           ${props.SSMParams.awsGlueDatabaseName.toLowerCase()}."connect_ef_evaluationquestionanswers_view"."evaluationId" =
           ${props.SSMParams.awsGlueDatabaseName.toLowerCase()}."connect_ef_evaluationsectionsscores_view"."evaluationId"))
       ORDER BY "connect_ef_evaluationquestionanswers_view"."evaluationId" ASC,
                "connect_ef_evaluationquestionanswers_view"."evaluationdefinitiontitle" ASC,
                "connect_ef_evaluationquestionanswers_view"."sectionrefid" ASC`;

    const connectEfEvaluationsAllQueryJson = JSON.stringify({"originalSql": connectEfEvaluationsAllQuery});

    const connectEfEvaluationsAllEncodedView = Buffer.from(connectEfEvaluationsAllQueryJson).toString('base64');

    const connectEfEvaluationsAllPrestoView = `/* Presto View: ${connectEfEvaluationsAllEncodedView} */`;

    const connectEfEvaluationsAllView = new glue.CfnTable(this, 'ConnectEfEvaluationsAllView', {
      catalogId: this.account,
      databaseName: props.SSMParams.awsGlueDatabaseName.toLowerCase(),
      tableInput: {
        name: 'connect_ef_evaluationsall_view',
        tableType: 'VIRTUAL_VIEW',
        description: 'Combines connect_ef_evaluationquestionanswers_view and connect_ef_evaluationsectionsscores_view views of connect_ef table. Used in Quicksight Dataset for Team, Evaluator dashboards.',
        viewOriginalText: connectEfEvaluationsAllPrestoView,
        parameters: {
          presto_view: 'true',
        },
        viewExpandedText: "/* Presto View */",
        storageDescriptor: {
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
              name: "evaluationformtotalscorepercentage",
              type: "float"
            },
            {
              name: "questionrefid",
              type: "string"
            },
            {
              name: "sectionrefid",
              type: "string"
            },
            {
              name: "sectiontitle",
              type: "string"
            },
            {
              name: "parentsectionrefid",
              type: "string"
            },
            {
              name: "questiontext",
              type: "string"
            },
            {
              name: "questionanswervalue",
              type: "string"
            },
            {
              name: "questionanswervaluerefid",
              type: "string"
            },
            {
              name: "questionanswerscorepercentage",
              type: "float"
            }
          ],
          location: "",
          numberOfBuckets: 0,
          serdeInfo: {},
          storedAsSubDirectories: false,
        },
      }
    });


    //connect_ef_evaluationsectionsscores_view
    const connectEfEvaluationSectionsScoresQuery =
      `SELECT evaluationId,
              contactid,
              instanceid,
              agentid,
              evaluationdefinitiontitle,
              evaluator,
              evaluationstarttimestamp,
              evaluationsubmittimestamp,
              evaluationformtotalscorepercentage,
              evaluationsectionsscores_MAIN.sectionrefid,
              evaluationsectionsscores_MAIN.sectiontitle,
              evaluationsectionsscores_MAIN.sectionscorepercentage
       FROM (${props.SSMParams.awsGlueDatabaseName.toLowerCase()}."connect_ef" CROSS JOIN UNNEST(evaluationsectionsscores) t (evaluationsectionsscores_MAIN))`;

    const connectEfEvaluationSectionsScoresQueryJson = JSON.stringify({"originalSql": connectEfEvaluationSectionsScoresQuery});

    const connectEfEvaluationSectionsScoresEncodedView = Buffer.from(connectEfEvaluationSectionsScoresQueryJson).toString('base64');

    const connectEfEvaluationSectionsScoresPrestoView = `/* Presto View: ${connectEfEvaluationSectionsScoresEncodedView} */`;

    const connectEfEvaluationSectionsScoresView = new glue.CfnTable(this, 'ConnectEfEvaluationSectionsScoresView', {
      catalogId: this.account,
      databaseName: props.SSMParams.awsGlueDatabaseName.toLowerCase(),
      tableInput: {
        name: 'connect_ef_evaluationsectionsscores_view',
        tableType: 'VIRTUAL_VIEW',
        description: 'Unnest JSON table connect_ef.evaluationsectionsscores array structure.',
        viewOriginalText: connectEfEvaluationSectionsScoresPrestoView,
        parameters: {
          presto_view: 'true',
        },
        viewExpandedText: "/* Presto View */",
        storageDescriptor: {
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
              name: "evaluationformtotalscorepercentage",
              type: "float"
            },
            {
              name: "sectionrefid",
              type: "string"
            },
            {
              name: "sectiontitle",
              type: "string"
            },
            {
              name: "sectionscorepercentage",
              type: "float"
            }
          ],
          location: "",
          numberOfBuckets: 0,
          serdeInfo: {},
          storedAsSubDirectories: false,
        },
      }
    });

    //final_connect_ef_evaluationsall_view
    const finalConnectEfEvaluationsAllQuery =
      `SELECT DISTINCT connect_ef_evaluationquestionanswers_view.evaluationId,
                       connect_ef_evaluationquestionanswers_view.contactid,
                       connect_ef_evaluationquestionanswers_view.instanceid,
                       connect_ef_evaluationquestionanswers_view.agentid,
                       connect_ef_evaluationquestionanswers_view.evaluationdefinitiontitle,
                       connect_ef_evaluationquestionanswers_view.evaluator,
                       connect_ef_evaluationquestionanswers_view.evaluationstarttimestamp,
                       connect_ef_evaluationquestionanswers_view.evaluationsubmittimestamp,
                       connect_ef_evaluationquestionanswers_view.evaluationformtotalscorepercentage,
                       connect_ef_evaluationquestionanswers_view.questionrefid,
                       connect_ef_evaluationquestionanswers_view.sectionrefid,
                       connect_ef_evaluationquestionanswers_view.sectiontitle,
                       connect_ef_evaluationquestionanswers_view.parentsectionrefid,
                       connect_ef_evaluationquestionanswers_view.questiontext,
                       connect_ef_evaluationquestionanswers_view.questionanswervalue,
                       connect_ef_evaluationquestionanswers_view.questionanswervaluerefid,
                       connect_ef_evaluationquestionanswers_view.questionanswerscorepercentage,
                       connect_ef_evaluationsectionsscores_view.sectionrefid           SCORE_sectionrefid,
                       connect_ef_evaluationsectionsscores_view.sectiontitle           SCORE_sectiontitle,
                       connect_ef_evaluationsectionsscores_view.sectionscorepercentage SCORE_sectionscorepercentage
       FROM (${props.SSMParams.awsGlueDatabaseName.toLowerCase()}."connect_ef_evaluationquestionanswers_view" INNER JOIN ${props.SSMParams.awsGlueDatabaseName.toLowerCase()}."connect_ef_evaluationsectionsscores_view" ON (
           ${props.SSMParams.awsGlueDatabaseName.toLowerCase()}."connect_ef_evaluationquestionanswers_view"."evaluationId" =
           ${props.SSMParams.awsGlueDatabaseName.toLowerCase()}."connect_ef_evaluationsectionsscores_view"."evaluationId"))
       ORDER BY "connect_ef_evaluationquestionanswers_view"."evaluationId" ASC,
                "connect_ef_evaluationquestionanswers_view"."evaluationdefinitiontitle" ASC,
                "connect_ef_evaluationquestionanswers_view"."sectionrefid" ASC`;

    const finalConnectEfEvaluationsAllQueryJson = JSON.stringify({"originalSql": finalConnectEfEvaluationsAllQuery});

    const finalConnectEfEvaluationsAllEncodedView = Buffer.from(finalConnectEfEvaluationsAllQueryJson).toString('base64');

    const finalConnectEfEvaluationsAllPrestoView = `/* Presto View: ${finalConnectEfEvaluationsAllEncodedView} */`;

    const finalConnectEfEvaluationsAllView = new glue.CfnTable(this, 'FinalConnectEfEvaluationsAllView', {
      catalogId: this.account,
      databaseName: props.SSMParams.awsGlueDatabaseName.toLowerCase(),
      tableInput: {
        name: 'final_connect_ef_evaluationsall_view',
        tableType: 'VIRTUAL_VIEW',
        description: 'Adds evaluation form table with section scores',
        viewOriginalText: finalConnectEfEvaluationsAllPrestoView,
        parameters: {
          presto_view: 'true',
        },
        viewExpandedText: "/* Presto View */",
        storageDescriptor: {
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
              name: "evaluationformtotalscorepercentage",
              type: "float"
            },
            {
              name: "questionrefid",
              type: "string"
            },
            {
              name: "sectionrefid",
              type: "string"
            },
            {
              name: "sectiontitle",
              type: "string"
            },
            {
              name: "parentsectionrefid",
              type: "string"
            },
            {
              name: "questiontext",
              type: "string"
            },
            {
              name: "questionanswervalue",
              type: "string"
            },
            {
              name: "questionanswervaluerefid",
              type: "string"
            },
            {
              name: "questionanswerscorepercentage",
              type: "float"
            },
            {
              name: "score_sectionrefid",
              type: "string"
            },
            {
              name: "score_sectiontitle",
              type: "string"
            },
            {
              name: "score_sectionscorepercentage",
              type: "float"
            }
          ],
          location: "",
          numberOfBuckets: 0,
          serdeInfo: {},
          storedAsSubDirectories: false,
        },
      }
    });

    //final_connect_evaluation_ctr_view
    const finalConnectEvaluationCtrQuery =
      `SELECT DISTINCT ${props.SSMParams.awsGlueDatabaseName.toLowerCase()}."final_connect_ef_evaluationsall_view"."evaluationId",
                       ${props.SSMParams.awsGlueDatabaseName.toLowerCase()}."final_connect_ef_evaluationsall_view"."contactid",
                       ${props.SSMParams.awsGlueDatabaseName.toLowerCase()}."final_connect_ef_evaluationsall_view"."instanceid",
                       ${props.SSMParams.awsGlueDatabaseName.toLowerCase()}."final_connect_ef_evaluationsall_view"."agentid",
                       ${props.SSMParams.awsGlueDatabaseName.toLowerCase()}."final_connect_ef_evaluationsall_view"."evaluationdefinitiontitle",
                       ${props.SSMParams.awsGlueDatabaseName.toLowerCase()}."final_connect_ef_evaluationsall_view"."evaluator",
                       ${props.SSMParams.awsGlueDatabaseName.toLowerCase()}."final_connect_ef_evaluationsall_view"."evaluationsubmittimestamp",
                       ${props.SSMParams.awsGlueDatabaseName.toLowerCase()}."final_connect_ef_evaluationsall_view"."evaluationformtotalscorepercentage",
                       ${props.SSMParams.awsGlueDatabaseName.toLowerCase()}."final_connect_ef_evaluationsall_view"."questionrefid",
                       ${props.SSMParams.awsGlueDatabaseName.toLowerCase()}."final_connect_ef_evaluationsall_view"."sectionrefid",
                       ${props.SSMParams.awsGlueDatabaseName.toLowerCase()}."final_connect_ef_evaluationsall_view"."sectiontitle",
                       ${props.SSMParams.awsGlueDatabaseName.toLowerCase()}."final_connect_ef_evaluationsall_view"."parentsectionrefid",
                       ${props.SSMParams.awsGlueDatabaseName.toLowerCase()}."final_connect_ef_evaluationsall_view"."questiontext",
                       ${props.SSMParams.awsGlueDatabaseName.toLowerCase()}."final_connect_ef_evaluationsall_view"."questionanswervalue",
                       ${props.SSMParams.awsGlueDatabaseName.toLowerCase()}."final_connect_ef_evaluationsall_view"."questionanswervaluerefid",
                       ${props.SSMParams.awsGlueDatabaseName.toLowerCase()}."final_connect_ef_evaluationsall_view"."questionanswerscorepercentage",
                       ${props.SSMParams.awsGlueDatabaseName.toLowerCase()}."final_connect_ef_evaluationsall_view"."score_sectionrefid",
                       ${props.SSMParams.awsGlueDatabaseName.toLowerCase()}."final_connect_ef_evaluationsall_view"."score_sectiontitle",
                       ${props.SSMParams.awsGlueDatabaseName.toLowerCase()}."final_connect_ef_evaluationsall_view"."score_sectionscorepercentage",
                       ${props.SSMParams.awsGlueDatabaseName.toLowerCase()}."connect_ctr_denormalized"."agent_username",
                       ${props.SSMParams.awsGlueDatabaseName.toLowerCase()}."connect_ctr_denormalized"."channel",
                       ${props.SSMParams.awsGlueDatabaseName.toLowerCase()}."connect_ctr_denormalized"."queue_name",
                       ${props.SSMParams.awsGlueDatabaseName.toLowerCase()}."connect_ctr_denormalized"."agent_routingprofile_name",
                       ${props.SSMParams.awsGlueDatabaseName.toLowerCase()}."connect_ctr_denormalized"."connectedtosystemtimestamp",
                       ${props.SSMParams.awsGlueDatabaseName.toLowerCase()}."connect_ctr_denormalized"."disconnecttimestamp",
                       ${props.SSMParams.awsGlueDatabaseName.toLowerCase()}."connect_ctr_denormalized"."initiationtimestamp"
       FROM (${props.SSMParams.awsGlueDatabaseName.toLowerCase()}."final_connect_ef_evaluationsall_view" LEFT JOIN ${props.SSMParams.awsGlueDatabaseName.toLowerCase()}."connect_ctr_denormalized" ON (
           ${props.SSMParams.awsGlueDatabaseName.toLowerCase()}."final_connect_ef_evaluationsall_view"."contactid" =
           ${props.SSMParams.awsGlueDatabaseName.toLowerCase()}."connect_ctr_denormalized"."contactid"))`;

    const finalConnectEvaluationCtrQueryJson = JSON.stringify({"originalSql": finalConnectEvaluationCtrQuery});

    const finalConnectEvaluationCtrEncodedView = Buffer.from(finalConnectEvaluationCtrQueryJson).toString('base64');

    const finalConnectEvaluationPrestoView = `/* Presto View: ${finalConnectEvaluationCtrEncodedView} */`;

    const finalConnectEvaluationCtrView = new glue.CfnTable(this, 'FinalConnectEvaluationCtrView', {
      catalogId: this.account,
      databaseName: props.SSMParams.awsGlueDatabaseName.toLowerCase(),
      tableInput: {
        name: 'final_connect_evaluation_ctr_view',
        tableType: 'VIRTUAL_VIEW',
        description: 'Combines final_connect_ef_evaluationsall_view table and connect_ctr_denormalized table. Used in Quicksight Dataset for Agent dashboards.',
        viewOriginalText: finalConnectEvaluationPrestoView,
        parameters: {
          presto_view: 'true',
        },
        viewExpandedText: "/* Presto View */",
        storageDescriptor: {
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
              name: "evaluationsubmittimestamp",
              type: "string"
            },
            {
              name: "evaluationformtotalscorepercentage",
              type: "float"
            },
            {
              name: "questionrefid",
              type: "string"
            },
            {
              name: "sectionrefid",
              type: "string"
            },
            {
              name: "sectiontitle",
              type: "string"
            },
            {
              name: "parentsectionrefid",
              type: "string"
            },
            {
              name: "questiontext",
              type: "string"
            },
            {
              name: "questionanswervalue",
              type: "string"
            },
            {
              name: "questionanswervaluerefid",
              type: "string"
            },
            {
              name: "questionanswerscorepercentage",
              type: "float"
            },
            {
              name: "score_sectionrefid",
              type: "string"
            },
            {
              name: "score_sectiontitle",
              type: "string"
            },
            {
              name: "score_sectionscorepercentage",
              type: "float"
            },
            {
              name: "agent_username",
              type: "string"
            },
            {
              name: "channel",
              type: "string"
            },
            {
              name: "queue_name",
              type: "string"
            },
            {
              name: "agent_routingprofile_name",
              type: "string"
            },
            {
              name: "connectedtosystemtimestamp",
              type: "string"
            },
            {
              name: "disconnecttimestamp",
              type: "string"
            },
            {
              name: "initiationtimestamp",
              type: "string"
            }
          ],
          location: "",
          numberOfBuckets: 0,
          serdeInfo: {},
          storedAsSubDirectories: false,
        },
      }
    });
  }
}
