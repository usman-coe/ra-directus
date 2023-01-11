import { stringify } from 'query-string';
import {
    fetchUtils,
    DataProvider,
    DeleteResult,
    DeleteManyResult,
} from 'react-admin';

/**
 * Maps react-admin queries to a directus powered REST API
 *
 * @see https://docs.directus.io/reference/introduction.html
 *
 * @example
 *
 * getList          => GET http://my.api.url/items/posts?page=1&limit=10&sort=title&meta=*
 * getOne           => GET http://my.api.url/items/posts/123
 * getManyReference => GET http://my.api.url/items/posts?filter={"author_id":{"_eq":119}}
 * getMany          => GET http://my.api.url/items/posts?filter={"id":{"_in":["123","456","789"]}}
 * create           => POST http://my.api.url/items/posts/123
 * update           => PATCH http://my.api.url/items/posts/123
 * updateMany       => PATCH http://my.api.url/items/posts
 * delete           => DELETE http://my.api.url/items/posts/123
 *
 * @example
 *
 * import * as React from "react";
 * import { Admin, Resource } from 'react-admin';
 * import directusDataProvider from 'ra-directus';
 *
 * import { PostList } from './posts';
 *
 * const App = () => (
 *     <Admin dataProvider={directusDataProvider('http://my-app.directus.app')}>
 *         <Resource name="posts" list={PostList} />
 *     </Admin>
 * );
 *
 * export default App;
 */
export const directusDataProvider = (
    apiBaseUrl: string,
    httpClient = fetchUtils.fetchJson
): DataProvider => ({
    getList: (resource, params) => {
        const { page, perPage } = params.pagination;
        const { field, order } = params.sort;
        const search = params.filter.search || params.filter.q;
        const filter = generateFilter(params.filter);
        const query = {
            filter: JSON.stringify(filter),
            page,
            limit: perPage,
            sort: order === 'ASC' ? field : `-${field}`,
            meta: '*',
            search,
        };
        const url = `${getDirectusEndpoint(resource, apiBaseUrl)}?${stringify(
            query
        )}`;

        return httpClient(url).then(({ json }) => ({
            data: json.data,
            total: json.meta.filter_count,
        }));
    },
    getOne: (resource, params) =>
        httpClient(
            `${getDirectusEndpoint(resource, apiBaseUrl)}/${params.id}`
        ).then(({ json }) => ({
            data: json.data,
        })),

    getMany: (resource, params) => {
        const filter = {
            id: {
                _in: params.ids,
            },
        };
        const query = {
            filter: JSON.stringify(filter),
        };
        const url = `${getDirectusEndpoint(resource, apiBaseUrl)}?${stringify(
            query
        )}`;
        return httpClient(url).then(({ json }) => ({ data: json.data }));
    },

    getManyReference: (resource, params) => {
        const { page, perPage } = params.pagination;
        const { field, order } = params.sort;
        const filter = {
            [params.target]: {
                _eq: params.id,
            },
        };
        const query = {
            filter: JSON.stringify(filter),
            page,
            limit: perPage,
            sort: order === 'ASC' ? field : `-${field}`,
            meta: '*',
        };
        const url = `${getDirectusEndpoint(resource, apiBaseUrl)}?${stringify(
            query
        )}`;

        return httpClient(url).then(({ json }) => ({
            data: json.data,
            total: json.meta.filter_count,
        }));
    },

    update: (resource, params) =>
        httpClient(
            `${getDirectusEndpoint(resource, apiBaseUrl)}/${params.id}`,
            {
                method: 'PATCH',
                body: JSON.stringify(params.data),
            }
        ).then(({ json }) => ({ data: json.data })),

    updateMany: (resource, params) => {
        return httpClient(getDirectusEndpoint(resource, apiBaseUrl), {
            method: 'PATCH',
            body: JSON.stringify({
                keys: params.ids,
                data: params.data,
            }),
        }).then(({ json }) => ({ data: json.data }));
    },

    create: (resource, params) =>
        httpClient(getDirectusEndpoint(resource, apiBaseUrl), {
            method: 'POST',
            body: JSON.stringify(params.data),
        }).then(({ json }) => ({
            data: json.data,
        })),

    delete: (resource, params): Promise<DeleteResult<any>> =>
        httpClient(
            `${getDirectusEndpoint(resource, apiBaseUrl)}/${params.id}`,
            {
                method: 'DELETE',
            }
        ).then(() => ({ data: params.previousData })),

    deleteMany: (resource, params): Promise<DeleteManyResult<any>> =>
        httpClient(getDirectusEndpoint(resource, apiBaseUrl), {
            method: 'DELETE',
            body: JSON.stringify(params.ids),
        }).then(() => ({ data: params.ids })),
});

const generateFilter = (filter: any) => {
    delete filter['search'];
    delete filter['q'];
    if (Object.keys(filter).length === 0) {
        return undefined;
    }
    let directusFilter: Record<string, string | {}> = {};
    for (const key in filter) {
        let field: string;
        let operator: string;
        if (key.includes('/')) {
            [field, operator] = key.split('/');
        } else {
            field = key;
            // By default we use _eq operator if the value is boolean, _contains in other cases
            operator = `${
                typeof filter[key] === 'boolean' ? '_eq' : '_contains'
            }`;
        }
        directusFilter = {
            ...directusFilter,
            [field]: {
                [operator]: filter[key],
            },
        };
    }
    const directusFilterKeys = Object.keys(directusFilter);
    if (directusFilterKeys.length > 1) {
        directusFilter = {
            _and: directusFilterKeys.map(key => ({
                [key]: directusFilter[key],
            })),
        };
    }
    return directusFilter;
};

const getDirectusEndpoint = (resource: string, apiBaseUrl: string) => {
    if (resource.startsWith('directus_')) {
        return `${apiBaseUrl}/${resource.replace('directus_', '')}`;
    }
    return `${apiBaseUrl}/items/${resource}`;
};
