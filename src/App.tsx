import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { CartProvider } from "./context/CartContext";
import { AuthProvider } from "./context/AuthContext";
import { AuthGate } from "./components/auth-gate";
import { StarsBackground } from "./components/stars-background";

import Home from "./pages/home";
import Cart from "./pages/cart";
import Checkout from "./pages/checkout";
import Orders from "./pages/orders";
import Login from "./pages/login";
import Register from "./pages/register";
import OrderDetail from "./pages/order-detail";
import AdminOrders from "./pages/admin-orders";
import AdminMenu from "./pages/admin-menu";
import AdminCategories from "./pages/admin-categories";
import AdminStatistics from "./pages/admin-statistics";
import Profile from "./pages/profile";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/cart" component={Cart} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/profile"><AuthGate><Profile /></AuthGate></Route>
      <Route path="/admin/statistics"><AuthGate admin><AdminStatistics /></AuthGate></Route>
      <Route path="/admin"><AuthGate admin><AdminOrders /></AuthGate></Route>
      <Route path="/admin/menu"><AuthGate admin><AdminMenu /></AuthGate></Route>
      <Route path="/admin/categories"><AuthGate admin><AdminCategories /></AuthGate></Route>
      <Route path="/checkout"><AuthGate><Checkout /></AuthGate></Route>
      <Route<{ id: string }> path="/orders/:id">{params => <AuthGate><OrderDetail id={params.id} /></AuthGate>}</Route>
      <Route path="/orders"><AuthGate><Orders /></AuthGate></Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider><CartProvider>
          <StarsBackground />
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </CartProvider></AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
