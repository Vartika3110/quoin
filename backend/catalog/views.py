from django.db.models import Count, Min, Prefetch
from rest_framework import viewsets
from rest_framework.filters import OrderingFilter, SearchFilter

from .models import Brand, Category, Product, ProductVariant
from .serializers import (
    BrandSerializer,
    CategorySerializer,
    ProductDetailSerializer,
    ProductListSerializer,
)


class CategoryViewSet(viewsets.ReadOnlyModelViewSet):
    """GET /api/v1/categories/ — storefront navigation."""

    serializer_class = CategorySerializer
    lookup_field = "slug"
    pagination_class = None
    queryset = (
        Category.objects.filter(is_active=True)
        .annotate(product_count=Count("products", filter=None))
        .order_by("position", "name")
    )


class BrandViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = BrandSerializer
    lookup_field = "slug"
    pagination_class = None
    queryset = Brand.objects.filter(is_active=True)


class ProductViewSet(viewsets.ReadOnlyModelViewSet):
    """GET /api/v1/products/ and /api/v1/products/{slug}/."""

    lookup_field = "slug"
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ["name", "sku", "brand__name", "category__name"]
    ordering_fields = ["name", "created_at", "cheapest"]
    ordering = ["name"]

    def get_serializer_class(self):
        return ProductDetailSerializer if self.action == "retrieve" else ProductListSerializer

    def get_queryset(self):
        qs = (
            Product.objects.filter(is_active=True)
            .select_related("brand", "category")
            # Prefetched because both serializers read every variant to find
            # the cheapest; without it a 24-product page is 25 queries.
            .prefetch_related(Prefetch("variants", queryset=ProductVariant.objects.filter(is_active=True)))
            .annotate(cheapest=Min("variants__price_paise"))
        )
        params = self.request.query_params
        if (c := params.get("category")):
            qs = qs.filter(category__slug=c)
        if (b := params.get("brand")):
            qs = qs.filter(brand__slug=b)
        if (f := params.get("fulfilment")):
            qs = qs.filter(fulfilment=f)
        return qs
