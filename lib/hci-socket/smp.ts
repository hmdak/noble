import * as events from 'events';
import * as crypto from './crypto';

import { AclStream } from './acl-stream';

const SMP_CID = 0x0006;

const SMP_PAIRING_REQUEST = 0x01;
const SMP_PAIRING_RESPONSE = 0x02;
const SMP_PAIRING_CONFIRM = 0x03;
const SMP_PAIRING_RANDOM = 0x04;
const SMP_PAIRING_FAILED = 0x05;
const SMP_ENCRYPT_INFO = 0x06;
const SMP_MASTER_IDENT = 0x07;

export class Smp extends events.EventEmitter {
  private _aclStream: AclStream;
  private _iat: Buffer;
  private _ia: Buffer;
  private _r!: Buffer;
  private _rat: Buffer;
  private _ra: Buffer;
  private _tk!: Buffer;
  private _pcnf!: Buffer;
  private _preq!: Buffer;
  private _pres!: Buffer;
  private onAclStreamDataBinded: (cid: number, data: Buffer) => void;
  private onAclStreamEndBinded: () => void;

  public constructor(
    aclStream: AclStream,
    localAddressType: string,
    localAddress: string,
    remoteAddressType: string,
    remoteAddress: string
  ) {
    super();
    this._aclStream = aclStream;

    this._iat = Buffer.from([localAddressType === 'random' ? 0x01 : 0x00]);
    this._ia = Buffer.from(
      localAddress
        .split(':')
        .reverse()
        .join(''),
      'hex'
    );
    this._rat = Buffer.from([remoteAddressType === 'random' ? 0x01 : 0x00]);
    this._ra = Buffer.from(
      remoteAddress
        .split(':')
        .reverse()
        .join(''),
      'hex'
    );

    this.onAclStreamDataBinded = this.onAclStreamData.bind(this);
    this.onAclStreamEndBinded = this.onAclStreamEnd.bind(this);

    this._aclStream.on('data', this.onAclStreamDataBinded);
    this._aclStream.on('end', this.onAclStreamEndBinded);
  }

  public sendPairingRequest() {
    this._preq = Buffer.from([
      SMP_PAIRING_REQUEST,
      0x03, // IO capability: NoInputNoOutput
      0x00, // OOB data: Authentication data not present
      0x01, // Authentication requirement: Bonding - No MITM
      0x10, // Max encryption key size
      0x00, // Initiator key distribution: <none>
      0x01, // Responder key distribution: EncKey
    ]);

    this.write(this._preq);
  }

  private onAclStreamData(cid: number, data: Buffer) {
    if (cid !== SMP_CID) {
      return;
    }

    const code = data.readUInt8(0);

    if (SMP_PAIRING_RESPONSE === code) {
      this.handlePairingResponse(data);
    } else if (SMP_PAIRING_CONFIRM === code) {
      this.handlePairingConfirm(data);
    } else if (SMP_PAIRING_RANDOM === code) {
      this.handlePairingRandom(data);
    } else if (SMP_PAIRING_FAILED === code) {
      this.handlePairingFailed(data);
    } else if (SMP_ENCRYPT_INFO === code) {
      this.handleEncryptInfo(data);
    } else if (SMP_MASTER_IDENT === code) {
      this.handleMasterIdent(data);
    }
  }

  private onAclStreamEnd() {
    this._aclStream.removeListener('data', this.onAclStreamDataBinded);
    this._aclStream.removeListener('end', this.onAclStreamEndBinded);

    this.emit('end');
  }

  private handlePairingResponse(data: Buffer) {
    this._pres = data;

    this._tk = Buffer.from('00000000000000000000000000000000', 'hex');
    this._r = crypto.r();

    this.write(
      Buffer.concat([
        Buffer.from([SMP_PAIRING_CONFIRM]),
        crypto.c1(this._tk, this._r, this._pres, this._preq, this._iat, this._ia, this._rat, this._ra),
      ])
    );
  }

  private handlePairingConfirm(data: Buffer) {
    this._pcnf = data;

    this.write(Buffer.concat([Buffer.from([SMP_PAIRING_RANDOM]), this._r]));
  }

  private handlePairingRandom(data: Buffer) {
    const r = data.slice(1);

    const pcnf = Buffer.concat([
      Buffer.from([SMP_PAIRING_CONFIRM]),
      crypto.c1(this._tk, r, this._pres, this._preq, this._iat, this._ia, this._rat, this._ra),
    ]);

    if (this._pcnf.toString('hex') === pcnf.toString('hex')) {
      const stk = crypto.s1(this._tk, r, this._r);

      this.emit('stk', stk);
    } else {
      this.write(Buffer.from([SMP_PAIRING_RANDOM, SMP_PAIRING_CONFIRM]));

      this.emit('fail');
    }
  }

  private handlePairingFailed(data: Buffer) {
    this.emit('fail');
  }

  private handleEncryptInfo(data: Buffer) {
    const ltk = data.slice(1);

    this.emit('ltk', ltk);
  }

  private handleMasterIdent(data: Buffer) {
    const ediv = data.slice(1, 3);
    const rand = data.slice(3);

    this.emit('masterIdent', ediv, rand);
  }

  private write(data: Buffer) {
    this._aclStream.write(SMP_CID, data);
  }
}
