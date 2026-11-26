import { useEffect, useLayoutEffect } from 'react';
import { StudioApp } from '../App';
import { StudioErrorBoundary } from '../components/StudioErrorBoundary';
import { I18nProvider } from '../i18n/I18n';
import { liveTime, usePlayerStore } from '../player/store/playerStore';
import { usePreviewIframeStore } from '../player/store/previewIframeStore';
import { StudioHostContext, type StudioHost } from './StudioHost';
import { requestedProject, validWorkspaceProject } from './workspaceRouting';

const host: StudioHost = { mvpEditor: true, gardenEmbedded: true, desktopLink: false, feedback: false };

function frameRate() {
  const frame = usePreviewIframeStore.getState().iframe;
  const root = frame?.contentDocument?.querySelector<HTMLElement>('[data-composition-id][data-fps]');
  const [numerator, denominator = 1] = (root?.dataset.fps ?? '30').split('/').map(Number);
  const fps = numerator / denominator;
  return Number.isFinite(fps) && fps > 0 ? fps : 30;
}

function GardenClock({ projectId }: { projectId: string }) {
  useEffect(() => {
    if (window.parent === window) return;
    const origin = window.location.origin;
    let ready = false, playing = false, duration = 0, last = 0, pending: number | undefined;
    const post = (type: 'ready' | 'time') => window.parent.postMessage({
      type: `laohu-studio:${type}`, time: liveTime.latest(), duration, playing, fps: frameRate(),
    }, origin);
    function update() {
      const state = usePlayerStore.getState();
      const nowReady = state.timelineProjectId === projectId && state.timelineReady && state.duration > 0;
      const changed = duration !== state.duration || playing !== state.isPlaying;
      const first = nowReady && !ready;
      ready = nowReady;
      duration = state.duration;
      playing = state.isPlaying;
      if (!ready) return;
      if (first) post('ready');
      else if (changed) post('time');
      if (pending !== undefined) {
        const target = Math.max(0, Math.min(duration, pending));
        pending = undefined;
        const fps = frameRate();
        state.requestSeek(Math.min(duration, Math.ceil(target * fps - 1e-7) / fps));
      }
    }
    const stopStore = usePlayerStore.subscribe(update);
    const stopClock = liveTime.subscribe(() => {
      const now = performance.now();
      if (!ready || playing && now - last < 100) return;
      last = now;
      post('time');
    });
    function receive(event: MessageEvent) {
      if (event.source !== window.parent || event.origin !== origin || !event.data) return;
      if (event.data.type === 'laohu-studio:status') {
        if (ready) post('ready');
      } else if (event.data.type === 'laohu-studio:seek' && typeof event.data.time === 'number' && Number.isFinite(event.data.time)) {
        pending = event.data.time;
        update();
      }
    }
    window.addEventListener('message', receive);
    update();
    return () => {
      window.removeEventListener('message', receive);
      stopClock();
      stopStore();
    };
  }, [projectId]);
  return null;
}

export default function GardenEmbed() {
  const projectId = requestedProject(window.location.search, window.location.hash) ?? 'project';
  useLayoutEffect(() => {
    if (window.parent === window) return;
    try {
      const scheme = window.parent.getComputedStyle(window.parent.document.documentElement).colorScheme;
      if (scheme === 'dark') document.documentElement.removeAttribute('data-theme');
    } catch { /* Keep the local Studio theme if the host document cannot be read. */ }
  }, []);
  if (!validWorkspaceProject(projectId)) return <p role="alert">工程地址无效</p>;
  return <I18nProvider><StudioHostContext.Provider value={host}><StudioErrorBoundary>
    <main className="flex h-full w-full" data-garden-openmotion="true" aria-label="OpenMotion 工程预览与时间轴">
      <StudioApp resolvedProjectId={projectId} readOnlyPreview />
      <GardenClock projectId={projectId} />
    </main>
  </StudioErrorBoundary></StudioHostContext.Provider></I18nProvider>;
}
