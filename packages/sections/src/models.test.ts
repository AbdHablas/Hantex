import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CATALOGUE,
  modelsShown,
  newProduct,
  productModelsSchema,
  showcaseOf,
  showcaseSchema,
  type Catalogue,
  type Product,
  type ProductModel,
} from './index';

const T = (en: string) => ({ en, ar: en });
const model = (n: number, finishId: string | null): ProductModel => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  label: 'measured',
  trueScale: true,
  finishId,
});

describe('3D models for each finish (D-058)', () => {
  it('holds at most one model for each finish of a product, each model once', () => {
    const ok = { products: { prdone: [model(1, 'fnwhite'), model(2, 'fnblack')] } };
    expect(productModelsSchema.safeParse(ok).success).toBe(true);
    const twoWhite = { products: { prdone: [model(1, 'fnwhite'), model(2, 'fnwhite')] } };
    expect(productModelsSchema.safeParse(twoWhite).success).toBe(false);
    const sameTwice = { products: { prdone: [model(1, 'fnwhite'), model(1, 'fnblack')] } };
    expect(productModelsSchema.safeParse(sameTwice).success).toBe(false);
  });

  it('shows one model per finish in the product’s finish order, and none of a finish it lacks', () => {
    const models = [model(1, 'fnblack'), model(2, 'fngone'), model(3, 'fnwhite')];
    expect(modelsShown(models, ['fnwhite', 'fnblack']).map((m) => m.finishId)).toEqual([
      'fnwhite',
      'fnblack',
    ]);
  });

  it('shows a model made without a finish only while no finish has one', () => {
    const general = model(1, null);
    expect(modelsShown([general], [])).toEqual([general]);
    expect(modelsShown([general], ['fnwhite'])).toEqual([general]);
    expect(modelsShown([general, model(2, 'fnwhite')], ['fnwhite'])).toEqual([model(2, 'fnwhite')]);
    expect(modelsShown([model(2, 'fngone')], ['fnwhite'])).toEqual([]);
  });

  it('gives each visible product its models in the showcase, and a hidden one none', () => {
    const catalogue: Catalogue = {
      ...DEFAULT_CATALOGUE,
      categories: [
        {
          id: 'catswitch',
          name: T('Switches'),
          slug: 'switches',
          parentId: null,
          main: true,
          description: T(''),
          image: null,
          attributeIds: [],
        },
      ],
      finishes: [
        { id: 'fnwhite', name: T('White'), swatch: '#ffffff', material: 'plastic', image: null },
        { id: 'fnblack', name: T('Black'), swatch: '#111111', material: 'plastic', image: null },
      ],
      products: ['prdone', 'prdhidden'],
    };
    const variant = (id: string, finishId: string) => ({
      id,
      sku: id.toUpperCase(),
      finishId,
      name: T(''),
      images: [],
    });
    const product = (slug: string, visible: boolean): Product => ({
      ...newProduct(T(slug), slug, 'catswitch'),
      visible,
      variants: [variant('varblack', 'fnblack'), variant('varwhite', 'fnwhite')],
    });
    const products = new Map([
      ['prdone', product('one', true)],
      ['prdhidden', product('hidden', false)],
    ]);
    const showcase = showcaseOf(catalogue, products, {
      products: {
        prdone: [model(1, 'fnwhite'), model(2, 'fnblack')],
        prdhidden: [model(3, 'fnwhite')],
      },
    });
    expect(showcase.products.map((p) => p.id)).toEqual(['prdone']);
    expect(showcase.products[0]!.models.map((m) => m.finishId)).toEqual(['fnblack', 'fnwhite']);
    expect(showcaseSchema.safeParse(showcase).success).toBe(true);
  });
});
