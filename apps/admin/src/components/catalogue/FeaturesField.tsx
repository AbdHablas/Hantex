import { MAX_FEATURES, type Feature } from '@hantex/sections';
import { MODEL_VIEW_NAMES } from '@hantex/studio';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { BilingualField } from '../document';
import { Button, Field, IconButton, Select } from '../ui';
import { newItemId } from '../../lib/builder';
import { useBilingual, useI18n } from '../../lib/i18n';
import { empty, move } from './parts';

/**
 * The features of a product or a series (D-059, D-060): up to six points in the team's own
 * words, in the order the website shows them. A series' features also show on each of its
 * products that has none of its own.
 */
export function FeaturesField({
  features,
  editable,
  onChange,
}: {
  features: Feature[];
  editable: boolean;
  onChange: (features: Feature[]) => void;
}) {
  const { m } = useI18n();
  const t = m.catalogue;
  return (
    <div className="grid gap-4">
      {features.length === 0 ? (
        <p className="text-sm text-muted">{t.noFeatures}</p>
      ) : (
        features.map((feature, index) => (
          <FeatureCard
            key={feature.id}
            feature={feature}
            index={index}
            last={index === features.length - 1}
            editable={editable}
            onChange={(next) => onChange(features.map((x) => (x.id === feature.id ? next : x)))}
            onMove={(step) => onChange(move(features, feature.id, step))}
            onRemove={() => onChange(features.filter((x) => x.id !== feature.id))}
          />
        ))
      )}
      {editable && features.length < MAX_FEATURES && (
        <div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              onChange([
                ...features,
                { id: newItemId(), title: empty(), text: empty(), view: 'angle' },
              ])
            }
          >
            <Plus aria-hidden />
            {t.addFeature}
          </Button>
        </div>
      )}
    </div>
  );
}

/** One feature: its title and text, and the 3D model's view beside it. */
function FeatureCard({
  feature,
  index,
  last,
  editable,
  onChange,
  onMove,
  onRemove,
}: {
  feature: Feature;
  index: number;
  last: boolean;
  editable: boolean;
  onChange: (feature: Feature) => void;
  onMove: (step: -1 | 1) => void;
  onRemove: () => void;
}) {
  const { m, format } = useI18n();
  const bi = useBilingual();
  const t = m.catalogue;
  const title = bi(feature.title) || format(t.featureN, { n: index + 1 });
  return (
    <section aria-label={title} className="grid gap-4 rounded-xl border border-border p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium">{title}</h3>
        {editable && (
          <div className="flex shrink-0 items-center gap-0.5">
            <IconButton
              label={format(t.moveUp, { name: title })}
              disabled={index === 0}
              onClick={() => onMove(-1)}
            >
              <ArrowUp className="size-4" aria-hidden />
            </IconButton>
            <IconButton
              label={format(t.moveDown, { name: title })}
              disabled={last}
              onClick={() => onMove(1)}
            >
              <ArrowDown className="size-4" aria-hidden />
            </IconButton>
            <IconButton label={format(t.removeFeature, { name: title })} onClick={onRemove}>
              <Trash2 className="size-4" aria-hidden />
            </IconButton>
          </div>
        )}
      </div>
      <BilingualField
        label={t.featureTitle}
        value={feature.title}
        max={80}
        disabled={!editable}
        onChange={(next) => onChange({ ...feature, title: next })}
      />
      <BilingualField
        label={t.featureText}
        help={t.featureTextHelp}
        value={feature.text}
        max={400}
        multiline
        disabled={!editable}
        onChange={(text) => onChange({ ...feature, text })}
      />
      <Field label={t.featureView} help={t.featureViewHelp}>
        {(props) => (
          <Select
            {...props}
            disabled={!editable}
            value={feature.view}
            onChange={(e) => onChange({ ...feature, view: e.target.value as Feature['view'] })}
          >
            {MODEL_VIEW_NAMES.map((view) => (
              <option key={view} value={view}>
                {t.featureViews[view]}
              </option>
            ))}
          </Select>
        )}
      </Field>
    </section>
  );
}
