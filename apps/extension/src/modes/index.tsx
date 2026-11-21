import type { ComponentType } from 'react';
import { Coffee, Heart, type LucideIcon } from 'lucide-react';
import {
  modeSchemas,
  detectEligibility,
  type ModeId,
  type Evidence,
  type UserContext,
  type Profile,
} from '@profile-lens/contracts';
import { OutreachView, RomanticView } from '../components/Results';

export interface ModeFieldsProps {
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
}
export interface ClientMode {
  id: ModeId;
  label: string;
  description: string;
  heading: string;
  theme: string;
  icon: LucideIcon;
  defaults: Record<string, unknown>;
  inputIssue: (profile: Profile, config: Record<string, unknown>) => string | null;
  InputFields: ComponentType<ModeFieldsProps>;
  ResultView: ComponentType<{
    data: unknown;
    evidence: Evidence[];
    userContext: UserContext;
    beforeCopy: () => Promise<boolean>;
    config?: Record<string, unknown>;
  }>;
}
function OutreachFields({ value, onChange }: ModeFieldsProps) {
  return (
    <div className="mode-fields">
      <label>
        What would you like to learn?
        <input
          maxLength={300}
          placeholder="Their path into design, open-source advice…"
          value={String(value.goal)}
          onChange={(e) => onChange({ ...value, goal: e.target.value })}
        />
      </label>
      <div className="field-row">
        <label>
          Tone
          <select
            value={String(value.tone)}
            onChange={(e) => onChange({ ...value, tone: e.target.value })}
          >
            <option value="friendly_professional">Friendly & professional</option>
            <option value="concise">Short & direct</option>
          </select>
        </label>
        <label>
          Meet over
          <select
            value={String(value.meetingFormat)}
            onChange={(e) => onChange({ ...value, meetingFormat: e.target.value })}
          >
            <option value="coffee_or_video">Coffee or video</option>
            <option value="coffee">Coffee</option>
            <option value="video">Video</option>
          </select>
        </label>
      </div>
    </div>
  );
}
function RomanticFields({ value, onChange }: ModeFieldsProps) {
  return (
    <div className="mode-fields">
      <label className="checkbox adult-check">
        <input
          type="checkbox"
          checked={value.adultConfirmedBoth === true}
          onChange={(e) => onChange({ ...value, adultConfirmedBoth: e.target.checked })}
        />
        <span>I confirm that we are both adults (18+).</span>
      </label>
      <div className="field-row">
        <label>
          Budget
          <select
            value={String(value.budget)}
            onChange={(e) => onChange({ ...value, budget: e.target.value })}
          >
            <option value="free">Free</option>
            <option value="low">Low-key</option>
            <option value="moderate">A little extra</option>
          </select>
        </label>
        <label>
          Setting
          <select
            value={String(value.settingPreference)}
            onChange={(e) => onChange({ ...value, settingPreference: e.target.value })}
          >
            <option value="either">Open to either</option>
            <option value="indoor">Indoors</option>
            <option value="outdoor">Outdoors</option>
          </select>
        </label>
      </div>
      <label>
        Tone
        <select
          value={String(value.tone)}
          onChange={(e) => onChange({ ...value, tone: e.target.value })}
        >
          <option value="warm">Warm & direct</option>
          <option value="playful">Light & playful</option>
          <option value="heartfelt">Sincere & heartfelt</option>
          <option value="confident">Confident & bold</option>
          <option value="relaxed">Relaxed & easygoing</option>
        </select>
      </label>
    </div>
  );
}
export const clientModes: Record<ModeId, ClientMode> = {
  outreach: {
    id: 'outreach',
    label: 'Outreach',
    description: 'A conversation worth having.',
    heading: 'Find your common ground.',
    theme: 'professional',
    icon: Coffee,
    defaults: { tone: 'friendly_professional', goal: '', meetingFormat: 'coffee_or_video' },
    InputFields: OutreachFields,
    inputIssue: () => null,
    ResultView: (props) => (
      <OutreachView {...props} data={modeSchemas.outreach.result.parse(props.data)} />
    ),
  },
  romantic: {
    id: 'romantic',
    label: 'Romantic Pursue',
    description: 'A thoughtful first move.',
    heading: 'Start with a little curiosity.',
    theme: 'warm',
    icon: Heart,
    defaults: {
      adultConfirmedBoth: false,
      tone: 'warm',
      budget: 'low',
      settingPreference: 'either',
    },
    InputFields: RomanticFields,
    inputIssue: (profile, config) => {
      const signals = detectEligibility(profile.evidence.map((e) => e.text).join('\n'));
      if (profile.eligibilitySignals.minorMentioned || signals.minorMentioned)
        return 'This profile contains an under-18 indicator. Romantic Pursue is for adults only.';
      if (profile.eligibilitySignals.noRomanticContact || signals.noRomanticContact)
        return 'This profile expresses a boundary about contact or dating.';
      return config.adultConfirmedBoth === true
        ? null
        : 'Confirm that you are both adults to continue.';
    },
    ResultView: (props) => (
      <RomanticView {...props} data={modeSchemas.romantic.result.parse(props.data)} />
    ),
  },
};
