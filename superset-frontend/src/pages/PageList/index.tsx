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
import { useMemo, useState } from 'react';
import { Link, useHistory } from 'react-router-dom';
import { t } from '@apache-superset/core/translation';
import { useListViewResource } from 'src/views/CRUD/hooks';
import { createErrorHandler, createFetchRelated } from 'src/views/CRUD/utils';
import withToasts from 'src/components/MessageToasts/withToasts';
import SubMenu, { SubMenuProps } from 'src/features/home/SubMenu';
import { DeleteModal, ConfirmStatusChange, Tag } from '@superset-ui/core/components';
import {
  FacePile,
  ModifiedInfo,
  ListView,
  ListViewActionsBar,
  ListViewFilterOperator as FilterOperator,
  type ListViewProps,
  type ListViewActionProps,
  type ListViewFilters,
} from 'src/components';
import { Icons } from '@superset-ui/core/components/Icons';
import { QueryObjectColumns } from 'src/views/CRUD/types';
import { copyPage, createPage, deletePages, type PageRecord } from 'src/features/pages/api';
import { blankPage, statusReportTemplate } from 'src/features/pages/templates';

const PAGE_SIZE = 25;

interface PageListProps {
  addDangerToast: (msg: string) => void;
  addSuccessToast: (msg: string) => void;
  user: { userId: string | number; firstName: string; lastName: string };
}

const pageUrl = (id: number) => `/page/${id}/`;

function PageList({ addDangerToast, addSuccessToast, user }: PageListProps) {
  const history = useHistory();
  const {
    state: { loading, resourceCount, resourceCollection: pages, bulkSelectEnabled },
    hasPerm,
    fetchData,
    refreshData,
    toggleBulkSelect,
  } = useListViewResource<PageRecord>('page', t('Pages'), addDangerToast);
  const [deleting, setDeleting] = useState<PageRecord | null>(null);
  const canWrite = hasPerm('can_write');

  const onError = (action: string) =>
    createErrorHandler(errMsg => addDangerToast(t('There was an issue %s: %s', action, errMsg)));

  const create = (body: Partial<PageRecord>) =>
    createPage(body).then(id => history.push(pageUrl(id)), onError(t('creating the page')));

  const duplicate = (page: PageRecord) =>
    copyPage(page.id).then(id => {
      addSuccessToast(t('Copied "%s"', page.title));
      history.push(pageUrl(id));
    }, onError(t('copying the page')));

  const remove = (selected: PageRecord[]) =>
    deletePages(selected.map(p => p.id)).then(message => {
      setDeleting(null);
      refreshData();
      addSuccessToast(message);
    }, onError(t('deleting')));

  const columns = useMemo(
    () => [
      {
        Cell: ({ row: { original } }: { row: { original: PageRecord } }) => (
          <Link to={pageUrl(original.id)} title={original.title}>
            {original.title}
          </Link>
        ),
        Header: t('Name'),
        accessor: 'title',
        id: 'title',
        size: 'xxl',
      },
      {
        Cell: ({ row: { original } }: { row: { original: PageRecord } }) =>
          original.is_template ? (
            <Tag color="blue">{t('Template · read-only')}</Tag>
          ) : original.published ? (
            <Tag color="green">{t('Published')}</Tag>
          ) : (
            <Tag>{t('Draft')}</Tag>
          ),
        Header: t('Status'),
        accessor: 'published',
        id: 'published',
        size: 'lg',
      },
      {
        Cell: ({ row: { original } }: { row: { original: PageRecord } }) => <FacePile users={original.owners} />,
        Header: t('Owners'),
        accessor: 'owners',
        id: 'owners',
        disableSortBy: true,
        size: 'lg',
      },
      {
        Cell: ({ row: { original } }: { row: { original: PageRecord } }) =>
          original.created_by ? `${original.created_by.first_name} ${original.created_by.last_name}` : '—',
        Header: t('Created by'),
        accessor: 'created_by',
        id: 'created_by',
        disableSortBy: true,
        size: 'lg',
      },
      {
        Cell: ({ row: { original } }: { row: { original: PageRecord } }) =>
          original.created_on ? new Date(original.created_on).toLocaleDateString() : '—',
        Header: t('Created'),
        accessor: 'created_on',
        id: 'created_on',
        size: 'md',
      },
      {
        Cell: ({ row: { original } }: { row: { original: PageRecord } }) => (
          <ModifiedInfo date={original.changed_on_delta_humanized ?? ''} user={original.changed_by ?? undefined} />
        ),
        Header: t('Last modified'),
        accessor: 'changed_on_delta_humanized',
        id: 'changed_on_delta_humanized',
        size: 'xl',
      },
      {
        Cell: ({ row: { original } }: { row: { original: PageRecord } }) => {
          const actions = [
            {
              label: 'edit-action',
              tooltip: original.is_template ? t('View template') : t('Open page'),
              placement: 'bottom',
              icon: original.is_template ? 'EyeOutlined' : 'EditOutlined',
              onClick: () => history.push(pageUrl(original.id)),
            },
            canWrite
              ? {
                  label: 'copy-action',
                  tooltip: original.is_template ? t('Clone to edit') : t('Duplicate'),
                  placement: 'bottom',
                  icon: 'CopyOutlined',
                  onClick: () => duplicate(original),
                }
              : null,
            canWrite && !original.is_template
              ? {
                  label: 'delete-action',
                  tooltip: t('Delete'),
                  placement: 'bottom',
                  icon: 'DeleteOutlined',
                  onClick: () => setDeleting(original),
                }
              : null,
          ].filter(Boolean);
          return <ListViewActionsBar actions={actions as ListViewActionProps[]} />;
        },
        Header: t('Actions'),
        id: 'actions',
        disableSortBy: true,
        size: 'lg',
      },
      { accessor: QueryObjectColumns.ChangedBy, hidden: true, id: QueryObjectColumns.ChangedBy },
      { accessor: 'is_template', hidden: true, id: 'is_template' },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canWrite],
  );

  const filters: ListViewFilters = useMemo(
    () => [
      {
        Header: t('Search'),
        key: 'search',
        id: 'title',
        input: 'search',
        operator: 'page_all_text' as FilterOperator,
      },
      {
        Header: t('Status'),
        key: 'published',
        id: 'published',
        input: 'select',
        operator: FilterOperator.Equals,
        unfilteredLabel: t('Any'),
        selects: [
          { label: t('Published'), value: true },
          { label: t('Draft'), value: false },
        ],
      },
      {
        Header: t('Type'),
        key: 'is_template',
        id: 'is_template',
        input: 'select',
        operator: FilterOperator.Equals,
        unfilteredLabel: t('Any'),
        selects: [
          { label: t('Templates'), value: true },
          { label: t('Pages'), value: false },
        ],
      },
      {
        Header: t('Owner'),
        key: 'owner',
        id: 'owners',
        input: 'select',
        operator: FilterOperator.RelationManyMany,
        unfilteredLabel: t('All'),
        fetchSelects: createFetchRelated(
          'page',
          'owners',
          createErrorHandler(errMsg => t('An error occurred while fetching page owner values: %s', errMsg)),
          user,
        ),
        paginate: true,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const menu: SubMenuProps = { name: t('Pages'), buttons: [] };
  if (canWrite) {
    menu.buttons!.push(
      { name: t('Bulk select'), onClick: toggleBulkSelect, buttonStyle: 'secondary' },
      {
        name: t('From status report template'),
        buttonStyle: 'secondary',
        icon: <Icons.FileTextOutlined iconSize="m" />,
        onClick: () => create(statusReportTemplate()),
      },
      {
        name: t('Page'),
        buttonStyle: 'primary',
        icon: <Icons.PlusOutlined iconSize="m" />,
        onClick: () => create(blankPage()),
      },
    );
  }

  return (
    <>
      <SubMenu {...menu} />
      {deleting && (
        <DeleteModal
          description={t('This permanently deletes the page "%s".', deleting.title)}
          onConfirm={() => remove([deleting])}
          onHide={() => setDeleting(null)}
          open
          title={t('Delete page?')}
        />
      )}
      <ConfirmStatusChange
        title={t('Please confirm')}
        description={t('Are you sure you want to delete the selected pages?')}
        onConfirm={remove}
      >
        {confirmDelete => {
          const bulkActions: ListViewProps['bulkActions'] = canWrite
            ? [{ key: 'delete', name: t('Delete'), onSelect: confirmDelete, type: 'danger' }]
            : [];
          return (
            <ListView<PageRecord>
              className="pages-list-view"
              columns={columns}
              count={resourceCount}
              data={pages}
              fetchData={fetchData}
              filters={filters}
              initialSort={[{ id: 'changed_on_delta_humanized', desc: true }]}
              loading={loading}
              pageSize={PAGE_SIZE}
              bulkActions={bulkActions}
              bulkSelectEnabled={bulkSelectEnabled}
              disableBulkSelect={toggleBulkSelect}
              addDangerToast={addDangerToast}
              addSuccessToast={addSuccessToast}
              refreshData={refreshData}
            />
          );
        }}
      </ConfirmStatusChange>
    </>
  );
}

export default withToasts(PageList);
