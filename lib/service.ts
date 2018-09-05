import * as events from 'events';

import * as services from './services.json';

export default class Service extends events.EventEmitter {
  private _noble;
  private _peripheralId;
  private uuid;
  private name;
  private type;
  private includedServiceUuids;
  private characteristics;

  constructor(noble, peripheralId, uuid) {
    super();
    this._noble = noble;
    this._peripheralId = peripheralId;

    this.uuid = uuid;
    this.name = null;
    this.type = null;
    this.includedServiceUuids = null;
    this.characteristics = null;

    const service = services[uuid];
    if (service) {
      this.name = service.name;
      this.type = service.type;
    }
  }

  toString() {
    return JSON.stringify({
      uuid: this.uuid,
      name: this.name,
      type: this.type,
      includedServiceUuids: this.includedServiceUuids
    });
  }

  discoverIncludedServices(serviceUuids, callback) {
    const promise = new Promise((resolve, reject) => {
      this.once('includedServicesDiscover', resolve);

      this._noble.discoverIncludedServices(
        this._peripheralId,
        this.uuid,
        serviceUuids
      );
    });

    if (callback && typeof callback === 'function') {
      promise.then(callback.bind(null, null), callback);
    }

    return promise;
  }

  discoverCharacteristics(characteristicUuids, callback) {
    const promise = new Promise((resolve, reject) => {
      this.once('characteristicsDiscover', resolve);

      this._noble.discoverCharacteristics(
        this._peripheralId,
        this.uuid,
        characteristicUuids
      );
    });

    if (callback && typeof callback === 'function') {
      promise.then(callback.bind(null, null), callback);
    }

    return promise;
  }
}
