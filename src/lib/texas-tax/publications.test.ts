import { describe, expect, it } from 'vitest';
import { PUBLICATIONS_INDEX_URL, TX_PUBLICATIONS, TX_SUBJECTS, isTxSubject } from './publications';

describe('the transcribed Comptroller index', () => {
  it('holds all 92 publications, 95 rows once cross-listings are counted', () => {
    expect(TX_PUBLICATIONS).toHaveLength(92);
    const rows = TX_PUBLICATIONS.reduce((n, pub) => n + pub.subjects.length, 0);
    expect(rows).toBe(95);
  });

  it('cross-lists exactly the three publications the index lists twice', () => {
    const twice = TX_PUBLICATIONS.filter((pub) => pub.subjects.length > 1).map((pub) => [
      pub.key,
      [...pub.subjects],
    ]);
    expect(twice).toEqual([
      ['96-224', ['Exempt Organizations', 'Hotel Occupancy Tax']],
      ['94-183', ['Exempt Organizations', 'Sales and Use Tax']],
      ['96-339', ['Local Sales and Use Tax', 'Sales and Use Tax']],
    ]);
  });

  it('files something under every subject, and nothing under an unknown one', () => {
    for (const subject of TX_SUBJECTS) {
      expect(TX_PUBLICATIONS.some((pub) => pub.subjects.includes(subject))).toBe(true);
    }
    for (const pub of TX_PUBLICATIONS) {
      for (const subject of pub.subjects) expect(isTxSubject(subject)).toBe(true);
    }
    expect(isTxSubject('Sales Tax')).toBe(false);
  });

  it('keeps keys and numbers unique and well-formed', () => {
    const keys = TX_PUBLICATIONS.map((pub) => pub.key);
    expect(new Set(keys).size).toBe(keys.length);
    const numbers = TX_PUBLICATIONS.flatMap((pub) => (pub.number ? [pub.number] : []));
    expect(new Set(numbers).size).toBe(numbers.length);
    for (const n of numbers) expect(n).toMatch(/^\d{2}-\d{3,4}$/);
    for (const pub of TX_PUBLICATIONS) {
      if (pub.number) expect(pub.key).toBe(pub.number);
    }
  });

  it('knows the six unnumbered entries by slug', () => {
    const unnumbered = TX_PUBLICATIONS.filter((pub) => !pub.number).map((pub) => pub.key);
    expect(unnumbered).toEqual([
      '2021-legislative-update',
      '2023-legislative-update',
      '2025-legislative-update',
      'local-government-assistance',
      'rate-charts',
      'sales-tax-rates',
    ]);
    expect(TX_PUBLICATIONS.find((pub) => pub.key === 'rate-charts')?.numberLabel).toBe('Charts');
  });

  it('carries the 26 Spanish editions, numbered with an s', () => {
    const spanish = TX_PUBLICATIONS.filter((pub) => pub.spanish);
    expect(spanish).toHaveLength(26);
    for (const pub of spanish) {
      expect(pub.spanish!.number).toBe(`${pub.number}s`);
      expect(pub.spanish!.title.length).toBeGreaterThan(0);
    }
    expect(TX_PUBLICATIONS.find((pub) => pub.key === '94-116')?.spanish?.title).toBe(
      'Reparación y Remodelación de Bienes Raíces',
    );
  });

  it('points every link at the Comptroller, PDFs at .pdf', () => {
    for (const pub of TX_PUBLICATIONS) {
      if (pub.url === null) {
        expect(pub.key).toBe('local-government-assistance');
        continue;
      }
      expect(pub.url.startsWith('https://comptroller.texas.gov/')).toBe(true);
      if (pub.number && pub.pdf) expect(pub.url.endsWith('.pdf')).toBe(true);
      if (pub.spanish) {
        expect(pub.spanish.url.startsWith(PUBLICATIONS_INDEX_URL)).toBe(true);
        expect(pub.spanish.url.endsWith(pub.spanish.pdf ? '.pdf' : '.php')).toBe(true);
      }
    }
  });

  it('marks a link checked only where it was seen live', () => {
    const find = (key: string) => TX_PUBLICATIONS.find((pub) => pub.key === key)!;
    expect(find('94-116')).toMatchObject({
      url: 'https://comptroller.texas.gov/taxes/publications/94-116.php',
      urlChecked: true,
    });
    expect(find('94-116').spanish?.urlChecked).toBe(true);
    expect(find('96-143')).toMatchObject({
      url: 'https://comptroller.texas.gov/taxes/publications/96-143/',
      urlChecked: true,
    });
    // Built from the pattern, never seen: labelled, not presented as known-good.
    expect(find('94-167')).toMatchObject({
      url: 'https://comptroller.texas.gov/taxes/publications/94-167.php',
      urlChecked: false,
    });
    expect(find('94-157').spanish?.urlChecked).toBe(false);
    const checked = TX_PUBLICATIONS.filter((pub) => pub.urlChecked).length;
    expect(checked).toBeGreaterThanOrEqual(35);
    expect(checked).toBeLessThan(TX_PUBLICATIONS.length);
  });

  it('explains every entry whose link is a stand-in', () => {
    for (const key of ['2023-legislative-update', '96-385', 'rate-charts', 'sales-tax-rates']) {
      expect(TX_PUBLICATIONS.find((pub) => pub.key === key)?.note).toBeTruthy();
    }
  });
});
