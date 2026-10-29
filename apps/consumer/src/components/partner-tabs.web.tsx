import { Tabs, TabList, TabTrigger, TabSlot } from 'expo-router/ui';
import { StyleSheet } from 'react-native';

import { CustomTabList, TabButton } from './app-tabs.web';

// Same layout as the student tabs: a bar above the screen, in the page flow.
export default function PartnerTabs() {
  return (
    <Tabs style={styles.fill}>
      <TabList asChild>
        <CustomTabList>
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
      <TabSlot style={styles.fill} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
