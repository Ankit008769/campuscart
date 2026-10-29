import type { CampusClient } from './api';

/** Group orders: one shop, one hostel, one delivery; each member picks and pays their own part. */

export type GroupItem = { variant_id: string; qty: number };

/** Opens a group order the student hosts, closing after `closesInMinutes`. Returns its id and code. */
export async function openGroupOrder(
  client: CampusClient,
  input: { shopId: string; dropPointId: string; closesInMinutes: number; roomNote?: string },
) {
  const { data, error } = await client.rpc('open_group_order', {
    p_shop_id: input.shopId,
    p_drop_point_id: input.dropPointId,
    p_closes_in_minutes: input.closesInMinutes,
    p_room_note: input.roomNote,
  });
  if (error) throw error;
  return { id: data.id, code: data.code };
}

/** Joins by the shared code. Returns the group's id. */
export async function joinGroupOrder(client: CampusClient, code: string): Promise<string> {
  const { data, error } = await client.rpc('join_group_order', { p_code: code });
  if (error) throw error;
  return data;
}

/** The group with every member, their items and (once placed) their share. */
export async function getGroupOrder(client: CampusClient, groupId: string) {
  const { data, error } = await client
    .from('group_orders')
    .select(
      'id, host_id, shop_id, code, closes_at, status, order_id, problem, shops (name), drop_points (name), group_members (student_id, items, share_paise, paid, profiles (name))',
    )
    .eq('id', groupId)
    .single();
  if (error) throw error;
  return data;
}

export async function setGroupItems(client: CampusClient, groupId: string, items: GroupItem[]) {
  const { error } = await client.rpc('set_group_items', { p_group_id: groupId, p_items: items });
  if (error) throw error;
}

export async function placeGroupOrder(client: CampusClient, groupId: string) {
  const { error } = await client.rpc('place_group_order', { p_group_id: groupId });
  if (error) throw error;
}

export async function setGroupPaid(client: CampusClient, groupId: string, studentId: string, paid: boolean) {
  const { error } = await client.rpc('set_group_paid', { p_group_id: groupId, p_student_id: studentId, p_paid: paid });
  if (error) throw error;
}

export async function leaveGroupOrder(client: CampusClient, groupId: string) {
  const { error } = await client.rpc('leave_group_order', { p_group_id: groupId });
  if (error) throw error;
}

export async function cancelGroupOrder(client: CampusClient, groupId: string) {
  const { error } = await client.rpc('cancel_group_order', { p_group_id: groupId });
  if (error) throw error;
}
