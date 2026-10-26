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
import { t } from '@apache-superset/core/translation';
import { DEFAULT_PAGE_SETTINGS, type PageRecord } from './api';
import { samplePage } from './editor/content/samplePage';
import { blankDoc } from './editor/content/builders';

export function blankPage(): Partial<PageRecord> {
  return {
    title: t('Untitled page'),
    content: JSON.stringify(blankDoc(t('Untitled page'))),
    page_settings: JSON.stringify(DEFAULT_PAGE_SETTINGS),
    published: false,
  };
}

/** The SharePoint-style bi-weekly status report, ready to add your own charts to. */
export function statusReportTemplate(): Partial<PageRecord> {
  return {
    title: t('FY26 Data Cloud — Bi-Weekly Progress Report'),
    content: JSON.stringify(samplePage()),
    page_settings: JSON.stringify({ ...DEFAULT_PAGE_SETTINGS, size: 'A4', layout: 'landscape' }),
    published: false,
  };
}
