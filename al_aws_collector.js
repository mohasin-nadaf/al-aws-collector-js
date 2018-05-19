/* -----------------------------------------------------------------------------
 * @copyright (C) 2018, Alert Logic, Inc
 * @doc
 *
 * Base class for AWS Lambda based collectors.
 *
 * @end
 * -----------------------------------------------------------------------------
 */
'use strict';

const AWS = require('aws-sdk');
const moment = require('moment');
const zlib = require('zlib');

const m_alServiceC = require('al-collector-js/al_servicec');
const m_alAws = require('./al_aws');

const INGEST_ENDPOINT = process.env.ingest_api;
const AZCOLLECT_ENDPOINT = process.env.azollect_api;

let AIMS_DECRYPTED_CREDS;

function getDescryptedCredentials(callback) {
    if (AIMS_DECRYPTED_CREDS) {
    	return callback(null, AIMS_DECRYPTED_CREDS);
    } else {
        const kms = new AWS.KMS();
        kms.decrypt(
            {CiphertextBlob: new Buffer(process.env.aims_secret_key, 'base64')},
            (err, data) => {
                if (err) {
                    return callback(err);
                } else {
                	AIMS_DECRYPTED_CREDS = {
                        access_key_id: process.env.aims_access_key_id,
                        secret_key: data.Plaintext.toString('ascii')
                    };
                    
                    return callback(null, AIMS_DECRYPTED_CREDS);
                }
            });
    }
}
/**
 * @class
 * Base class for AWS lambda based collectors
 *
 * @constructor
 * @param {Object} aimsCreds - Alert Logic API credentials.
 * @param {string} [aisCreds.access_key_id] - Alert Logic API access key id.
 * @param {string} [aisCreds.secret_key] - Alert Logic API secret key.
 *
 */
class AlAwsCollector {
	static get IngestTypes() {
		return {
			SECMSGS : 'secmsgs',
			VPCFLOW : 'vpcflow'
		}
	};
    
    static load() {
    	return new Promise(function(resolve, reject){
    		getDescryptedCredentials(function(err, creds){
    			if (err){
    				reject(err);
    			} else {
    				resolve(creds);
    			}
    		})
    	})
    }
    
    constructor(context, collectorType, ingestType, version, aimsCreds) {
    	this._invokeContext = context;
    	this._arn = context.invokedFunctionArn;
    	this._collectorType = collectorType;
    	this._ingestType = ingestType;
    	this._version = version;
    	this._region = process.env.AWS_REGION;
    	this._name = process.env.AWS_LAMBDA_FUNCTION_NAME;
        this._alApiEndpoint = process.env.al_api;
        this._alIngestEndpoint = process.env.ingest_api;
        this._alAzcollectEndpoint = process.env.azollect_api;
        this._aimsc = new m_alServiceC.AimsC(process.env.al_api, aimsCreds);
        this._azcollectc = new m_alServiceC.AzcollectC(process.env.azollect_api, this._aimsc);
        this._ingestc = new m_alServiceC.IngestC(process.env.azollect_api, this._aimsc);
    }
    
    _getAttrs() {
    	return {
    		collectorType : this._collectorType,
	        awsAccountId : m_alAws.arnToAccId(this._arn),
	        region : this._region,
	        functionName : this._name,
	        version : this._version
    	};
    }
    
    updateEndpoints(callback) {
        return callback(null);
    }
    
    register(custom, callback) {
    	const regValues = Object.assign(this._getAttrs(), custom);

    	this._azcollectc.doRegistration(regValues)
            .then(resp => {
                return callback(null);
            })
            .catch(exception => {
                return callback(exception);
            });
    }
    
    checkin(status, callback) {
    	const checkinValues = Object.assign(this._getAttrs(), status);
    	
        this._azcollectc.doCheckin(checkinValues)
        .then(resp => {
            return callback(null);
        })
        .catch(exception => {
            return callback(exception);
        });
    }
    
    deregister(custom, callback){
    	const regValues = Object.assign(this._getAttrs(), custom);

    	this._azcollectc.doDeregistration(regValues)
            .then(resp => {
                return callback(null);
            })
            .catch(exception => {
                return callback(exception);
            });
    }
    
    send(data, callback){
    	var collector = this;
    	
    	zlib.deflate(data, function(compressionErr, compressed) {
            if (compressionErr) {
                return callback(compressionErr);
            } else {
            	switch (collector._ingestType) {
            		case AlAwsCollector.IngestTypes.SECMSGS:
            			collector._ingestc.sendSecmsgs(compressed)
	                    .then(resp => {
	                        return callback(null, resp);
	                    })
	                    .catch(exception =>{
	                        return callback(exception);
	                    });
	            		break;
            		case AlAwsCollector.IngestTypes.VPCFLOW:
            			collector._ingestc.sendVpcFlow(compressed)
	                    .then(resp => {
	                        return callback(null, resp);
	                    })
	                    .catch(exception =>{
	                        return callback(exception);
	                    });
	            		break;
            		default:
	            		return callback('Unknow Alertlogic ingestion type:', type);
            	}
            }
        });
    }
}

module.exports = {
    AlAwsCollector : AlAwsCollector
};
