"""API representations.

Shaped to match what the Next.js storefront already consumes, so wiring
it up is a change of data source rather than a rewrite of components.
Prices stay in integer paise across the wire; formatting is the client's
job and the client already does it.
"""
from rest_framework import serializers

from .models import Brand, Category, PriceTier, Product, ProductVariant


class PriceTierSerializer(serializers.ModelSerializer):
    class Meta:
        model = PriceTier
        fields = ("min_qty", "max_qty", "price_paise")


class VariantSerializer(serializers.ModelSerializer):
    price_tiers = PriceTierSerializer(many=True, read_only=True)

    class Meta:
        model = ProductVariant
        fields = ("id", "label", "sku", "mrp_paise", "price_paise",
                  "pro_price_paise", "min_qty", "step_qty", "is_default", "price_tiers")


class BrandSerializer(serializers.ModelSerializer):
    class Meta:
        model = Brand
        fields = ("id", "name", "slug")


class CategorySerializer(serializers.ModelSerializer):
    product_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Category
        fields = ("id", "name", "slug", "parent", "position", "product_count")


class ProductListSerializer(serializers.ModelSerializer):
    """Card payload — deliberately lean, one row per product on a grid."""

    brand = serializers.CharField(source="brand.name", default=None, read_only=True)
    category = serializers.CharField(source="category.name", default=None, read_only=True)
    price_paise = serializers.SerializerMethodField()
    mrp_paise = serializers.SerializerMethodField()
    is_from_price = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = ("id", "sku", "name", "slug", "brand", "category", "image",
                  "fulfilment", "pricing_unit", "gst_rate",
                  "price_paise", "mrp_paise", "is_from_price")

    def _cheapest(self, obj):
        variants = list(obj.variants.all())
        return min(variants, key=lambda v: v.price_paise) if variants else None

    def get_price_paise(self, obj):
        v = self._cheapest(obj)
        return v.price_paise if v else None

    def get_mrp_paise(self, obj):
        v = self._cheapest(obj)
        return v.mrp_paise if v else None

    def get_is_from_price(self, obj):
        """True when the card must read "₹X Onwards" rather than an exact price."""
        return len(obj.variants.all()) > 1


class ProductDetailSerializer(ProductListSerializer):
    variants = VariantSerializer(many=True, read_only=True)
    brand_detail = BrandSerializer(source="brand", read_only=True)

    class Meta(ProductListSerializer.Meta):
        fields = ProductListSerializer.Meta.fields + (
            "description", "brand_detail", "variants",
        )
