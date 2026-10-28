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
import {
  copyPresentation,
  createPresentation,
  deletePresentations,
  parseSource,
  type PresentationRecord,
} from 'src/features/presentations/api';
import { blankDeck, PRESENTATION_SETTINGS } from 'src/features/presentations/deckToDoc';
import { CreatePresentationModal } from 'src/features/presentations/CreatePresentationModal';

const PAGE_SIZE = 25;

interface PresentationListProps {
  addDangerToast: (msg: string) => void;
  addSuccessToast: (msg: string) => void;
  user: { userId: string | number; firstName: string; lastName: string };
}

const presentationUrl = (id: number) => `/presentation/${id}/`;

function PresentationList({ addDangerToast, addSuccessToast, user }: PresentationListProps) {
  const history = useHistory();
  const {
    state: { loading, resourceCount, resourceCollection: presentations, bulkSelectEnabled },
    hasPerm,
    fetchData,
    refreshData,
    toggleBulkSelect,
  } = useListViewResource<PresentationRecord>('presentation', t('Presentations'), addDangerToast);
  const [deleting, setDeleting] = useState<PresentationRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const canWrite = hasPerm('can_write');

  const onError = (action: string) =>
    createErrorHandler(errMsg => addDangerToast(t('There was an issue %s: %s', action, errMsg)));

  const createBlank = () =>
    createPresentation({
      title: t('Untitled presentation'),
      content: JSON.stringify(blankDeck(t('Untitled presentation'))),
      page_settings: JSON.stringify(PRESENTATION_SETTINGS),
      published: false,
    }).then(id => history.push(presentationUrl(id)), onError(t('creating the presentation')));

  const duplicate = (item: PresentationRecord) =>
    copyPresentation(item.id).then(id => {
      addSuccessToast(t('Copied "%s"', item.title));
      history.push(presentationUrl(id));
    }, onError(t('copying the presentation')));

  const remove = (selected: PresentationRecord[]) =>
    deletePresentations(selected.map(p => p.id)).then(message => {
      setDeleting(null);
      refreshData();
      addSuccessToast(message);
    }, onError(t('deleting')));

  const columns = useMemo(
    () => [
      {
        Cell: ({ row: { original } }: { row: { original: PresentationRecord } }) => (
          <Link to={presentationUrl(original.id)} title={original.title}>
            {original.title}
          </Link>
        ),
        Header: t('Name'),
        accessor: 'title',
        id: 'title',
        size: 'xxl',
      },
      {
        Cell: ({ row: { original } }: { row: { original: PresentationRecord } }) =>
          original.published ? (
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
        Cell: ({ row: { original } }: { row: { original: PresentationRecord } }) => {
          const engine = parseSource(original).engine;
          if (engine === 'presenton') return <Tag color="purple">{t('Presenton')}</Tag>;
          if (engine === 'claude') return <Tag color="geekblue">{t('Claude')}</Tag>;
          return <Tag>{engine === 'draft' ? t('Draft from data') : t('Manual')}</Tag>;
        },
        Header: t('Built with'),
        accessor: 'source',
        id: 'source',
        disableSortBy: true,
        size: 'md',
      },
      {
        Cell: ({ row: { original } }: { row: { original: PresentationRecord } }) => <FacePile users={original.owners} />,
        Header: t('Owners'),
        accessor: 'owners',
        id: 'owners',
        disableSortBy: true,
        size: 'lg',
      },
      {
        Cell: ({ row: { original } }: { row: { original: PresentationRecord } }) =>
          original.created_by ? `${original.created_by.first_name} ${original.created_by.last_name}` : '—',
        Header: t('Created by'),
        accessor: 'created_by',
        id: 'created_by',
        disableSortBy: true,
        size: 'lg',
      },
      {
        Cell: ({ row: { original } }: { row: { original: PresentationRecord } }) =>
          original.created_on ? new Date(original.created_on).toLocaleDateString() : '—',
        Header: t('Created'),
        accessor: 'created_on',
        id: 'created_on',
        size: 'md',
      },
      {
        Cell: ({ row: { original } }: { row: { original: PresentationRecord } }) => (
          <ModifiedInfo date={original.changed_on_delta_humanized ?? ''} user={original.changed_by ?? undefined} />
        ),
        Header: t('Last modified'),
        accessor: 'changed_on_delta_humanized',
        id: 'changed_on_delta_humanized',
        size: 'xl',
      },
      {
        Cell: ({ row: { original } }: { row: { original: PresentationRecord } }) => {
          const actions = [
            {
              label: 'edit-action',
              tooltip: t('Open presentation'),
              placement: 'bottom',
              icon: 'EditOutlined',
              onClick: () => history.push(presentationUrl(original.id)),
            },
            canWrite
              ? {
                  label: 'copy-action',
                  tooltip: t('Duplicate'),
                  placement: 'bottom',
                  icon: 'CopyOutlined',
                  onClick: () => duplicate(original),
                }
              : null,
            canWrite
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
        operator: 'presentation_all_text' as FilterOperator,
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
        Header: t('Owner'),
        key: 'owner',
        id: 'owners',
        input: 'select',
        operator: FilterOperator.RelationManyMany,
        unfilteredLabel: t('All'),
        fetchSelects: createFetchRelated(
          'presentation',
          'owners',
          createErrorHandler(errMsg => t('An error occurred while fetching presentation owner values: %s', errMsg)),
          user,
        ),
        paginate: true,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const menu: SubMenuProps = { name: t('Presentations'), buttons: [] };
  if (canWrite) {
    menu.buttons!.push(
      { name: t('Bulk select'), onClick: toggleBulkSelect, buttonStyle: 'secondary' },
      {
        name: t('Blank presentation'),
        buttonStyle: 'secondary',
        icon: <Icons.PlusOutlined iconSize="m" />,
        onClick: createBlank,
      },
      {
        name: t('Create with AI'),
        buttonStyle: 'primary',
        icon: <Icons.ThunderboltOutlined iconSize="m" />,
        onClick: () => setCreating(true),
      },
    );
  }

  return (
    <>
      <SubMenu {...menu} />
      {creating && (
        <CreatePresentationModal
          show
          onHide={() => setCreating(false)}
          onCreated={id => history.push(presentationUrl(id))}
          addDangerToast={addDangerToast}
          addSuccessToast={addSuccessToast}
        />
      )}
      {deleting && (
        <DeleteModal
          description={t('This permanently deletes the presentation "%s".', deleting.title)}
          onConfirm={() => remove([deleting])}
          onHide={() => setDeleting(null)}
          open
          title={t('Delete presentation?')}
        />
      )}
      <ConfirmStatusChange
        title={t('Please confirm')}
        description={t('Are you sure you want to delete the selected presentations?')}
        onConfirm={remove}
      >
        {confirmDelete => {
          const bulkActions: ListViewProps['bulkActions'] = canWrite
            ? [{ key: 'delete', name: t('Delete'), onSelect: confirmDelete, type: 'danger' }]
            : [];
          return (
            <ListView<PresentationRecord>
              className="presentations-list-view"
              columns={columns}
              count={resourceCount}
              data={presentations}
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

export default withToasts(PresentationList);
