// RiseOS — Bluetooth Share Service
// Shares data with nearby RiseOS devices via Web Bluetooth API.
// Falls back to the Web Share API when Bluetooth is unavailable.

import { offlineDB, type BluetoothShareRecord } from './offline-db';

// ─── BLE Protocol Constants ─────────────────────────────────────────────

const RISEOS_SERVICE_UUID = '00001234-0000-1000-8000-00805f9b34fb';
const RISEOS_CHAR_WRITE_UUID = '00001235-0000-1000-8000-00805f9b34fb';
const RISEOS_CHAR_NOTIFY_UUID = '00001236-0000-1000-8000-00805f9b34fb';
const BLE_MTU = 20; // Typical BLE MTU (safe chunk size)

// ─── Helper: chunk a string into BLE-safe pieces ────────────────────────

function encodeChunks(json: string): string[] {
  const header = `RISEOS:${json.length}:`;
  const payload = header + json;
  const chunks: string[] = [];
  for (let i = 0; i < payload.length; i += BLE_MTU) {
    chunks.push(payload.slice(i, i + BLE_MTU));
  }
  return chunks;
}

function decodeChunks(chunks: string[]): string {
  const full = chunks.join('');
  const match = full.match(/^RISEOS:(\d+):(.*)$/s);
  if (!match) throw new Error('بيانات غير صالحة من جهاز آخر');
  return match[2];
}

// ─── Bluetooth Share Service ────────────────────────────────────────────

class BluetoothShareService {
  // ─── Capability Check ────────────────────────────────────────────────

  isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  }

  // ─── Share Data ──────────────────────────────────────────────────────

  /**
   * Share data with a nearby device.
   * Tries Web Bluetooth first; falls back to Web Share API.
   */
  async shareData(data: object, type: string): Promise<string> {
    const json = JSON.stringify(data);

    if (this.isSupported()) {
      try {
        return await this.shareViaBluetooth(json, type);
      } catch (bluetoothError) {
        console.warn(
          '[BluetoothShare] Bluetooth failed, falling back to Web Share:',
          bluetoothError
        );
        return await this.shareViaWebShare(json, type);
      }
    }

    // No Bluetooth — try Web Share
    return await this.shareViaWebShare(json, type);
  }

  // ─── Receive Data ────────────────────────────────────────────────────

  /**
   * Scan for nearby RiseOS devices and receive shared data.
   * Saves received data to IndexedDB bluetoothShares store.
   */
  async receiveData(): Promise<BluetoothShareRecord[]> {
    if (!this.isSupported()) {
      throw new Error(
        'متصفحك لا يدعم البلوتوث. يرجى استخدام Chrome أو Edge على أندرويد/ديسكتوب.'
      );
    }

    const bt = (navigator as unknown as { bluetooth: Bluetooth }).bluetooth;

    try {
      const device = await bt.requestDevice({
        filters: [{ services: [RISEOS_SERVICE_UUID] }],
      });

      const server = await device.gatt!.connect();

      const service = await server.getPrimaryService(RISEOS_SERVICE_UUID);
      const notifyChar = await service.getCharacteristic(
        RISEOS_CHAR_NOTIFY_UUID
      );

      const chunks: string[] = [];

      await notifyChar.startNotifications();
      notifyChar.addEventListener(
        'characteristicvaluechanged',
        ((event: Event) => {
          const value = (event as BluetoothCharacteristicValueEvent).target
            ?.value;
          if (value) {
            const decoder = new TextDecoder();
            chunks.push(decoder.decode(value));
          }
        }) as EventListener
      );

      // Wait for data to arrive (simple timeout-based approach)
      await new Promise((resolve) => setTimeout(resolve, 5000));

      await notifyChar.stopNotifications();
      server.disconnect();

      if (chunks.length === 0) {
        throw new Error('لم يتم استلام أي بيانات من الجهاز المجاور.');
      }

      const json = decodeChunks(chunks);
      const parsedData = JSON.parse(json);

      const record: Omit<BluetoothShareRecord, 'id'> = {
        senderName: device.name || 'جهاز مجهول',
        data: json,
        type,
        receivedAt: Date.now(),
      };

      await offlineDB.add('bluetoothShares', record);

      // Return all bluetooth shares
      const allShares = await offlineDB.getAll<BluetoothShareRecord>(
        'bluetoothShares'
      );
      return allShares;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotFoundError') {
        throw new Error('لم يتم العثور على أجهزة RiseOS قريبة. تأكد أن البلوتوث مفعّل وأن الجهاز الآخر يستقبل.');
      }
      throw error;
    }
  }

  // ─── Internal: Share via Bluetooth ───────────────────────────────────

  private async shareViaBluetooth(
    json: string,
    type: string
  ): Promise<string> {
    const bt = (navigator as unknown as { bluetooth: Bluetooth }).bluetooth;

    // Request device with RiseOS service
    const device = await bt.requestDevice({
      filters: [{ services: [RISEOS_SERVICE_UUID] }],
    });

    const server = await device.gatt!.connect();
    const service = await server.getPrimaryService(RISEOS_SERVICE_UUID);
    const writeChar = await service.getCharacteristic(
      RISEOS_CHAR_WRITE_UUID
    );

    const encoder = new TextEncoder();
    const chunks = encodeChunks(json);

    for (const chunk of chunks) {
      await writeChar.writeValue(encoder.encode(chunk));
    }

    server.disconnect();

    return `تم إرسال البيانات بنجاح عبر البلوتوث إلى "${device.name || 'جهاز مجهول'}"`;
  }

  // ─── Internal: Share via Web Share API ───────────────────────────────

  private async shareViaWebShare(
    json: string,
    type: string
  ): Promise<string> {
    if (typeof navigator === 'undefined' || !navigator.share) {
      throw new Error(
        'متصفحك لا يدعم مشاركة البيانات. يرجى استخدام متصفح يدعم Web Share API أو البلوتوث.'
      );
    }

    const blob = new Blob([json], { type: 'application/json' });
    const file = new File([blob], `riseos-${type}-${Date.now()}.json`, {
      type: 'application/json',
    });

    try {
      await navigator.share({
        title: `RiseOS — مشاركة ${type}`,
        text: `بيانات RiseOS: ${type}`,
        files: [file],
      });
      return 'تمت المشاركة بنجاح';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return 'تم إلغاء المشاركة';
      }
      throw new Error('فشلت المشاركة. حاول مرة أخرى.');
    }
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────

export const bluetoothShare = new BluetoothShareService();