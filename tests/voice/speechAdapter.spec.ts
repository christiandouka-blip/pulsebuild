import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_VOICE_PREFERENCES } from "@/domain/voice";
import type { VoiceAnnouncement, VoicePreferences } from "@/domain/voice";
import {
  cancelSpeech,
  isSpeechAvailable,
  listVoices,
  presentationHintForVoiceName,
  resetSpeechHost,
  selectVoice,
  setSpeechHost,
  speakAnnouncement,
  type SpeechHost,
  type SpeechHostUtterance,
  type SpeechHostVoice,
} from "@/lib/voice/speechAdapter";

const SAMPLE: VoiceAnnouncement = {
  id: "announce-tl-obs-signal-1",
  timelineEventId: "tl-obs-signal-1",
  kind: "tier1Signal",
  text: "Tier 1 signal. Inspection Missing on task-pour-level-1-slab.",
  simulatedAt: "2026-03-14T10:30:00.000Z",
  spokenAs: "current",
  relatedSignalIds: ["signal-1"],
  relatedIssueIds: ["issue-1"],
};

function prefs(overrides: Partial<VoicePreferences> = {}): VoicePreferences {
  return { ...DEFAULT_VOICE_PREFERENCES, ...overrides };
}

function voice(
  partial: Partial<SpeechHostVoice> & Pick<SpeechHostVoice, "voiceURI" | "name">,
): SpeechHostVoice {
  return {
    lang: "en-US",
    localService: true,
    default: false,
    ...partial,
  };
}

function createFakeHost(voices: SpeechHostVoice[]) {
  const spoken: SpeechHostUtterance[] = [];
  let cancelled = 0;
  const host: SpeechHost = {
    getVoices: () => voices,
    speak: (utterance) => {
      spoken.push({ ...utterance });
    },
    cancel: () => {
      cancelled += 1;
    },
  };
  return {
    host,
    spoken,
    cancelledCount: () => cancelled,
  };
}

describe("speech adapter", () => {
  afterEach(() => {
    resetSpeechHost();
  });

  it("treats Node without a host as unavailable", () => {
    resetSpeechHost();
    expect(isSpeechAvailable()).toBe(false);
    expect(listVoices()).toEqual([]);
    expect(speakAnnouncement(SAMPLE, prefs())).toEqual({
      ok: false,
      code: "UNAVAILABLE",
    });
  });

  it("handles an explicit empty inventory without throwing", () => {
    const fake = createFakeHost([]);
    setSpeechHost(fake.host);
    expect(isSpeechAvailable()).toBe(true);
    expect(listVoices()).toEqual([]);
    const result = speakAnnouncement(SAMPLE, prefs());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fallback).toBe("unset");
    expect(result.voiceURI).toBeNull();
    expect(fake.spoken[0]?.text).toBe(SAMPLE.text);
    expect(fake.spoken[0]?.voiceURI).toBeNull();
  });

  it("returns curated descriptors rather than raw host objects", () => {
    const fake = createFakeHost([
      voice({ voiceURI: "uri-samantha", name: "Samantha", default: true }),
    ]);
    setSpeechHost(fake.host);
    const options = listVoices();
    expect(options).toHaveLength(1);
    expect(options[0]).toEqual({
      voiceURI: "uri-samantha",
      name: "Samantha",
      lang: "en-US",
      localService: true,
      default: true,
      presentationHint: "female",
    });
    expect(Object.keys(options[0]).sort()).toEqual([
      "default",
      "lang",
      "localService",
      "name",
      "presentationHint",
      "voiceURI",
    ]);
  });

  it("lets an exact selectedVoiceURI win", () => {
    const voices = [
      voice({ voiceURI: "uri-samantha", name: "Samantha" }),
      voice({ voiceURI: "uri-daniel", name: "Daniel", default: true }),
    ];
    const fake = createFakeHost(voices);
    setSpeechHost(fake.host);
    const result = speakAnnouncement(
      SAMPLE,
      prefs({
        selectedVoiceURI: "uri-daniel",
        preferredVoicePresentation: "female",
      }),
    );
    expect(result).toMatchObject({
      ok: true,
      fallback: "selected",
      voiceURI: "uri-daniel",
    });
    expect(fake.spoken[0]?.voiceURI).toBe("uri-daniel");
  });

  it("falls back when the selected voice is missing", () => {
    const fake = createFakeHost([
      voice({ voiceURI: "uri-samantha", name: "Samantha" }),
      voice({ voiceURI: "uri-default", name: "Google US English", default: true }),
    ]);
    setSpeechHost(fake.host);
    const missingThenFemale = speakAnnouncement(
      SAMPLE,
      prefs({
        selectedVoiceURI: "uri-gone",
        preferredVoicePresentation: "female",
      }),
    );
    expect(missingThenFemale).toMatchObject({
      ok: true,
      fallback: "presentation",
      voiceURI: "uri-samantha",
    });

    const missingThenDefault = speakAnnouncement(
      SAMPLE,
      prefs({
        selectedVoiceURI: "uri-gone",
        preferredVoicePresentation: "any",
      }),
    );
    expect(missingThenDefault).toMatchObject({
      ok: true,
      fallback: "default",
      voiceURI: "uri-default",
    });

    const noDefault = createFakeHost([
      voice({ voiceURI: "uri-first", name: "Google US English" }),
      voice({ voiceURI: "uri-second", name: "Google US English 2" }),
    ]);
    setSpeechHost(noDefault.host);
    const first = speakAnnouncement(SAMPLE, prefs({ selectedVoiceURI: "uri-gone" }));
    expect(first).toMatchObject({
      ok: true,
      fallback: "first",
      voiceURI: "uri-first",
    });
  });

  it("groups presentation hints conservatively and keeps unknown voices usable", () => {
    expect(presentationHintForVoiceName("Samantha")).toBe("female");
    expect(presentationHintForVoiceName("Daniel")).toBe("male");
    expect(presentationHintForVoiceName("Google UK English Female")).toBe("female");
    expect(presentationHintForVoiceName("Google US English")).toBe("unknown");
    const voices = listVoicesFrom([
      voice({ voiceURI: "uri-unknown", name: "Google US English", default: true }),
    ]);
    expect(voices[0]?.presentationHint).toBe("unknown");
    const chosen = selectVoice(voices, prefs({ selectedVoiceURI: "uri-unknown" }));
    expect(chosen.fallback).toBe("selected");
    expect(chosen.voice?.voiceURI).toBe("uri-unknown");
  });

  it("accepts volume 0 and 1 and clamps invalid adapter input", () => {
    const fake = createFakeHost([voice({ voiceURI: "uri-1", name: "Daniel" })]);
    setSpeechHost(fake.host);
    speakAnnouncement(SAMPLE, prefs({ volume: 0 }));
    speakAnnouncement(SAMPLE, prefs({ volume: 1 }));
    speakAnnouncement(SAMPLE, prefs({ volume: -4 }));
    speakAnnouncement(SAMPLE, prefs({ volume: 8 }));
    expect(fake.spoken.map((item) => item.volume)).toEqual([0, 1, 0, 1]);
  });

  it("speaks announcement text without mutating the announcement or preferences", () => {
    const fake = createFakeHost([
      voice({ voiceURI: "uri-samantha", name: "Samantha", default: true }),
    ]);
    setSpeechHost(fake.host);
    const announcement = { ...SAMPLE };
    const preferences = prefs({ selectedVoiceURI: "uri-samantha" });
    const announcementBefore = structuredClone(announcement);
    const preferencesBefore = structuredClone(preferences);
    const result = speakAnnouncement(announcement, preferences);
    expect(result.ok).toBe(true);
    expect(fake.spoken[0]?.text).toBe(SAMPLE.text);
    expect(fake.spoken[0]?.voiceURI).toBe("uri-samantha");
    expect(announcement).toEqual(announcementBefore);
    expect(preferences).toEqual(preferencesBefore);
  });

  it("cancel invokes host cancel only", () => {
    const fake = createFakeHost([voice({ voiceURI: "uri-1", name: "Daniel" })]);
    setSpeechHost(fake.host);
    speakAnnouncement(SAMPLE, prefs());
    cancelSpeech();
    cancelSpeech();
    expect(fake.cancelledCount()).toBe(2);
    expect(fake.spoken).toHaveLength(1);
  });

  it("keeps SpeechSynthesis APIs inside the adapter only", () => {
    const adapter = readFileSync("lib/voice/speechAdapter.ts", "utf8");
    expect(adapter.includes("SpeechSynthesisUtterance")).toBe(true);
    expect(adapter.includes("speechSynthesis")).toBe(true);
    expect(adapter.includes("synth.speak")).toBe(true);
    expect(adapter.includes("synth.cancel")).toBe(true);
    expect(adapter.includes("synth.getVoices")).toBe(true);
    for (const file of [
      "store/useVoiceStore.ts",
      "lib/orchestration/commandCenter.ts",
      "lib/voice/eligibility.ts",
      "lib/voice/announcementText.ts",
      "domain/voice/types.ts",
    ]) {
      const source = readFileSync(file, "utf8");
      expect(source.includes("SpeechSynthesis"), file).toBe(false);
      expect(source.includes("SpeechSynthesisUtterance"), file).toBe(false);
    }
  });

  it("returns disabled and muted without speaking", () => {
    const fake = createFakeHost([voice({ voiceURI: "uri-1", name: "Daniel" })]);
    setSpeechHost(fake.host);
    expect(speakAnnouncement(SAMPLE, prefs({ enabled: false }))).toEqual({
      ok: false,
      code: "DISABLED",
    });
    expect(speakAnnouncement(SAMPLE, prefs({ muted: true }))).toEqual({
      ok: false,
      code: "MUTED",
    });
    expect(fake.spoken).toEqual([]);
  });
});

function listVoicesFrom(voices: SpeechHostVoice[]) {
  const fake = createFakeHost(voices);
  setSpeechHost(fake.host);
  return listVoices();
}
