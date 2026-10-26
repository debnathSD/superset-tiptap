/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import { jsPDF } from 'jspdf';
import { pageGeometry } from '../pagination/geometry';
import { captureRegion, downloadBlob, fileName, imageSize, pageRegions, sheetBackground, type ExportContext } from './common';

/** One PDF page per sheet, exactly as laid out on screen (2x raster). */
export async function exportPdf(ctx: ExportContext) {
  const geometry = pageGeometry(ctx.settings);
  const orientation = geometry.width > geometry.height ? 'landscape' : 'portrait';
  const pdf = new jsPDF({ orientation, unit: 'px', format: [geometry.width, geometry.height], hotfixes: ['px_scaling'], compress: true });
  const background = sheetBackground(ctx.sheet);
  const regions = pageRegions(ctx.sheet);
  for (let i = 0; i < regions.length; i += 1) {
    const image = await captureRegion(ctx.sheet, regions[i], background);
    const size = await imageSize(image);
    // A block taller than a page makes that sheet taller: shrink it to fit the paper.
    const scale = Math.min(geometry.width / (size.width / 2), geometry.height / (size.height / 2), 1);
    const w = (size.width / 2) * scale;
    const h = (size.height / 2) * scale;
    if (i > 0) pdf.addPage([geometry.width, geometry.height], orientation);
    pdf.addImage(image, 'PNG', (geometry.width - w) / 2, 0, w, h, undefined, 'FAST');
  }
  pdf.setProperties({ title: ctx.title, creator: 'Apache Superset Pages' });
  downloadBlob(pdf.output('blob'), fileName(ctx.title, 'pdf'));
}
