import { api, emit } from '../api.js';
import { createCard, btn } from '../components/card.js';

export function createCaptureView({ initialCollapsed = false } = {}) {
  const deviceSelect = document.createElement('select');
  deviceSelect.className = 'select';

  const snapBtn = btn('Screenshot');
  snapBtn.disabled = true;

  const recBtn = btn('REC');
  recBtn.disabled = true;

  const video = document.createElement('video');
  video.autoplay = true;
  video.playsInline = true;
  video.muted = true;
  video.className = 'capture-video';

  const wrap = document.createElement('div');
  wrap.className = 'capture';
  wrap.appendChild(video);

  let stream = null;
  let collapsed = initialCollapsed;
  let labelAccessGranted = false;
  let savedDeviceId = null;
  let recorder = null;
  let recordedChunks = [];
  let recordedExt = 'webm';

  async function ensureLabelAccess() {
    if (labelAccessGranted || collapsed) return;
    try {
      const probe = await navigator.mediaDevices.getUserMedia({ video: true });
      probe.getTracks().forEach((t) => t.stop());
      labelAccessGranted = true;
    } catch {
      // permission denied or no devices
    }
  }

  async function refreshDevices() {
    if (!collapsed) await ensureLabelAccess();
    const all = await navigator.mediaDevices.enumerateDevices();
    const inputs = all.filter((d) => d.kind === 'videoinput');
    const prev = deviceSelect.value;
    deviceSelect.innerHTML = '';
    if (!inputs.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '(no video devices)';
      opt.disabled = true;
      opt.selected = true;
      deviceSelect.appendChild(opt);
      return;
    }
    for (const d of inputs) {
      const opt = document.createElement('option');
      opt.value = d.deviceId;
      opt.textContent = d.label || `Camera ${d.deviceId.slice(0, 8)}`;
      deviceSelect.appendChild(opt);
    }
    if (prev && inputs.some((d) => d.deviceId === prev)) {
      deviceSelect.value = prev;
    } else if (savedDeviceId && inputs.some((d) => d.deviceId === savedDeviceId)) {
      deviceSelect.value = savedDeviceId;
    }
  }

  function stop() {
    if (recorder && recorder.state === 'recording') {
      recorder.stop(); // onstop will save what we have
    }
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    video.srcObject = null;
    snapBtn.disabled = true;
    recBtn.disabled = true;
  }

  async function start() {
    if (collapsed) return;
    const deviceId = deviceSelect.value;
    if (!deviceId) return;
    stop();
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false
      });
      video.srcObject = stream;
      snapBtn.disabled = false;
      recBtn.disabled = false;
    } catch (err) {
      console.error('capture getUserMedia failed:', err);
    }
  }

  function pickRecorderMime() {
    const candidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
    for (const m of candidates) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m;
    }
    return '';
  }

  function startRecording() {
    if (!stream) return;
    const mime = pickRecorderMime();
    recordedExt = mime.includes('mp4') ? 'mp4' : 'webm';
    recordedChunks = [];
    try {
      recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    } catch (err) {
      console.error('MediaRecorder init failed:', err);
      return;
    }
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size) recordedChunks.push(e.data);
    };
    recorder.onstop = async () => {
      const finalMime = recorder.mimeType || mime || 'video/webm';
      const blob = new Blob(recordedChunks, { type: finalMime });
      recordedChunks = [];
      recorder = null;
      recBtn.textContent = 'REC';
      recBtn.classList.remove('recording');
      if (!blob.size) return;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const res = await api.saveRecording(bytes, recordedExt);
      if (res.ok) emit('screenshots:changed');
      else console.error('saveRecording failed:', res.error);
    };
    recorder.start();
    recBtn.textContent = 'Stop';
    recBtn.classList.add('recording');
  }

  function toggleRecording() {
    if (recorder && recorder.state === 'recording') recorder.stop();
    else startRecording();
  }

  async function snapshot() {
    if (!stream || !video.videoWidth || !video.videoHeight) return;
    snapBtn.disabled = true;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('canvas.toBlob returned null');
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const res = await api.saveCaptureImage(bytes);
      if (res.ok) emit('screenshots:changed');
      else console.error('saveCaptureImage failed:', res.error);
    } catch (err) {
      console.error('snapshot failed:', err);
    } finally {
      snapBtn.disabled = !stream;
    }
  }

  deviceSelect.addEventListener('change', async () => {
    if (deviceSelect.value) {
      savedDeviceId = deviceSelect.value;
      await api.setConfig({ captureDeviceId: deviceSelect.value });
    }
    start();
  });
  snapBtn.addEventListener('click', snapshot);
  recBtn.addEventListener('click', toggleRecording);
  navigator.mediaDevices.addEventListener('devicechange', refreshDevices);

  const { element } = createCard({
    id: 'capture',
    title: 'Video preview',
    initialCollapsed,
    actions: [deviceSelect, snapBtn, recBtn],
    body: wrap,
    onToggle: async (isCollapsed) => {
      collapsed = isCollapsed;
      if (collapsed) {
        stop();
        return;
      }
      await refreshDevices();
      start();
    }
  });
  element.classList.add('capture-card');

  (async () => {
    const cfg = await api.getConfig();
    savedDeviceId = cfg.captureDeviceId || null;
    await refreshDevices();
    start();
  })();

  return element;
}
