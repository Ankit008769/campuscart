import { Tabs, TabList, TabTrigger, TabSlot } from 'expo-router/ui';

import { CustomTabList, TabButton } from './app-tabs.web';

export default function PartnerTabs() {
  return (
    <Tabs>
      <TabSlot style={{ height: '100%' }} />
      <TabList asChild>
        <CustomTabList brand="CampusCart for shops">
          <TabTrigger name="home" href="/partner" asChild>
            <TabButton>Orders</TabButton>
          </TabTrigger>
          <TabTrigger name="catalog" href="/partner/catalog" asChild>
            <TabButton>Catalog</TabButton>
          </TabTrigger>
          <TabTrigger name="shop" href="/partner/shop" asChild>
            <TabButton>Shop</TabButton>
          </TabTrigger>
        </CustomTabList>
      </TabList>
    </Tabs>
  );
}
