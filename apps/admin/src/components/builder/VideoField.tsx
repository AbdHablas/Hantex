import { parseVideoUrl, videoPageUrl, type VideoRef } from '@hantex/sections';
import { useEffect, useState } from 'react';
import { useI18n } from '../../lib/i18n';
import { Field, Input } from '../ui';

/**
 * A YouTube or Vimeo video (D-046): the link is pasted as copied from the browser or a share
 * button, and only the service and the video's id are kept.
 */
export function VideoField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: VideoRef;
  onChange: (value: VideoRef) => void;
  disabled: boolean;
}) {
  const { m } = useI18n();
  const b = m.builder;
  const [text, setText] = useState(value ? videoPageUrl(value) : '');
  // Follow changes made elsewhere (e.g. restoring a version), without undoing typing.
  useEffect(() => {
    setText((current) => {
      const parsed = parseVideoUrl(current);
      const same =
        parsed && value ? parsed.provider === value.provider && parsed.id === value.id : false;
      return same || (!value && !parsed) ? current : value ? videoPageUrl(value) : '';
    });
  }, [value]);
  const invalid = text.trim() !== '' && parseVideoUrl(text) === null;
  return (
    <Field label={label} help={b['videoHelp']} error={invalid ? b['videoInvalid'] : undefined}>
      {(props) => (
        <Input
          {...props}
          type="url"
          dir="ltr"
          inputMode="url"
          placeholder="https://www.youtube.com/watch?v=…"
          disabled={disabled}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const parsed = parseVideoUrl(e.target.value);
            if (parsed || e.target.value.trim() === '') onChange(parsed);
          }}
        />
      )}
    </Field>
  );
}
