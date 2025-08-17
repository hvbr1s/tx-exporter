export interface ExportResponse {
    id: string;
    creation_time: string;
    type: string;
    state: string;
    organization_id: string;
    user_id: string;
    resource_type: string;
    successful_items_count: number;
    failed_items_count: number;
    total_items_count: number;
    request_id: string;
    download_url?: string;
    expiration_time?: string
}