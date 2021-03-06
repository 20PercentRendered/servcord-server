import { Logger } from "@main/logger";
import pem from "pem";
import fs from "fs";
import crypto from 'crypto'
const logger = new Logger("SSL");
import util from "util";
import randomNumber from "random-number-csprng"
import bigInt from "big-integer"
import { BaseModule } from "@main/classes/modules/BaseModule";
import { ServerData } from "@main/serverdata";

export default class SSLModule implements BaseModule {
	public readonly name: string = "SSL Certificate Handler/Generator";
	public readonly intName: string = "ssl";
	public readonly version: number = 1;
	private days: number = 7; //FIXME: Load from configs
	public ssl: SSL;
	private readonly DISCORD_EPOCH = new Date("2015").getTime()
    readonly dependencies = new Array<string>();
	init(next: () => void) {
		try {
			const privateKey = fs.readFileSync("sslcert/server.key", "utf8");
			const certificate = fs.readFileSync("sslcert/server.crt", "utf8");
			try {
				var ssmarkerfile = fs.readFileSync("sslcert/selfsigned.marker", "utf8"); 
				if (ssmarkerfile != null ) {
					var ssmarker = <SelfSignedMarker>JSON.parse(ssmarkerfile);
					ssmarker.date = new Date(ssmarker.date)
					var validTo = new Date(ssmarker.date.getFullYear(),ssmarker.date.getMonth(),ssmarker.date.getDate()+ssmarker.days);
					if ((validTo.getTime()<=Date.now())) {
						logger.warn("Self signed certs have expired. Creating new certificates.")
						throw new Error("Certificates are out of date.")
					} else {
						logger.info("Certificates are up to date.")
					}
				}
			} catch (e) {
				// Rethrow
				logger.debugerror(e);
				throw e;
			}
			this.ssl = new SSL(privateKey, certificate)
		} catch (e) {
			logger.info("Creating certs. ");
			logger.warn("Consider using your own certificates.");
			this.generateCertificate().then((value)=>{
				logger.info("Certificates created successfully.");
				this.ssl = value;
				next();
			}).catch((err)=>{
				logger.error(err);
				logger.error("Exiting as SSL is required and keys failed to generate." );
				ServerData.getInstance().loader.forceShutdown("SSL fail")
			})
		}
	}
	private generateCertificate(): Promise<SSL> {
		return new Promise((resolve,reject)=>{
			pem.createCertificate({ days: this.days, selfSigned: true }, (err, keys) => {
				if (err) {
					reject(err);
				}
				if (!fs.existsSync("sslcert")){
					fs.mkdirSync("sslcert");
				}				
				fs.writeFileSync("sslcert/server.key", keys.serviceKey);
				fs.writeFileSync("sslcert/server.crt", keys.certificate);
				fs.writeFileSync("sslcert/selfsigned.marker", JSON.stringify(new SelfSignedMarker(Date.now(),this.days)));
				resolve(new SSL(keys.serviceKey, keys.certificate))
			});
		})
	}
	stop(next: () => void) {
		next();
    }
    generateSnowflake(): Promise<string> {
        return new Promise(async (resolve,reject)=>{
			var time = bigInt(this.getDiscordEpochTime().shiftLeft(22));
			// TODO: server ids etc
            resolve((time.toString()))
        });
	}
	getDiscordEpochTime(): bigInt.BigInteger {
		return bigInt(Date.now()).minus(this.DISCORD_EPOCH)
	}
	generateToken(user): Promise<string> {
		return new Promise(async (resolve,reject)=>{
			const parts: string[] = [
				this.getBase64User(user),
				Buffer.from(this.getDiscordEpochTime().toString()).toString('base64')
			];
			resolve(`${this.clean(parts.join('.'))}.${this.clean(Buffer.from(SSLModule.generateSecureRandom(20)).toString('base64'))}`);
		});
	}
	static generateRandomArray(numberCount: number, numberLength: number): Promise<Array<number>> {
        return new Promise(async (resolve,reject)=>{
			var array = new Array<number>(numberCount);
			for (var i = 0; i<numberCount; i++) {
				array.push(await SSLModule.generateRandomNumbers(numberLength));
			}
			resolve(array);
		})
    }
	getBase64User(user) {
		return this.clean(Buffer.from(user).toString('base64'));
	}
	private clean(string: string): string {
		return string.replace(/=/g, '')
	}
	static generateSecureRandom(length: number): string {
		return crypto.randomBytes(length).toString('hex');
	}
    static generateRandomNumbers(length: number): Promise<number> {
        var i: number;
        var min = "1";
        var max = "9";
        for (i = 0; i < length; i++) {
            min += "0"
            max += "9"
        } 
        return randomNumber(new Number(min), new Number(max));
    }
	constructor() {
		
	}
}
export class SSL {
	public key: string;
	public cert: string;
	constructor(key, cert) {
		this.key = key;
		this.cert = cert;
	}
}
class SelfSignedMarker {
	public date: Date;
	public days: number;
	constructor (date, days) {
		this.date = date;
		this.days = days;
	}
}
