import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';

import './styles/base.css';
import './styles/quick-commerce.css';
import './styles/web.css';
import { Layout } from './components/Layout';
import { AuthProvider } from './lib/auth';
import { CartProvider } from './lib/cart';
import { CatalogProvider } from './lib/catalog';
import { LocationProvider } from './lib/location';
import { Favorites, ProductDetails, Profile, Terms } from './pages/Account';
import { Cart } from './pages/Cart';
import { Checkout } from './pages/Checkout';
import { Home } from './pages/Home';
import { Login } from './pages/Login';
import { OrderPage, Orders } from './pages/Orders';
import { Shop } from './pages/Shop';

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/shop', element: <Shop /> },
      { path: '/product/:id', element: <ProductDetails /> },
      { path: '/cart', element: <Cart /> },
      { path: '/checkout', element: <Checkout /> },
      { path: '/orders', element: <Orders /> },
      { path: '/order/:id', element: <OrderPage /> },
      { path: '/favorites', element: <Favorites /> },
      { path: '/profile', element: <Profile /> },
      { path: '/login', element: <Login /> },
      { path: '/terms', element: <Terms /> },
      {
        path: '*',
        element: (
          <div className="empty-state">
            <h1>Page not found</h1>
            <a href="/">Back to the shops</a>
          </div>
        ),
      },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <LocationProvider>
        <CatalogProvider>
          <CartProvider>
            <RouterProvider router={router} />
          </CartProvider>
        </CatalogProvider>
      </LocationProvider>
    </AuthProvider>
  </StrictMode>,
);
