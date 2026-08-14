import { useState } from 'react';
import { CheckCircle2, CircleDashed, Plus, Loader2, Sparkles } from 'lucide-react';
import { GlassPanel } from '@/components/qm/GlassPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

interface CreateProductData {
  tenantId: string;
  name: string;
  key: string;
  description?: string;
  iconUrl?: string;
  color?: string;
  jiraProjectKey?: string;
  azureDevopsAreaPath?: string;
}

interface CreateProductFormProps {
  tenantId: string;
  onProductCreated?: (product: any) => void;
  onCancel?: () => void;
}

export function CreateProductForm({ tenantId, onProductCreated, onCancel }: CreateProductFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState<CreateProductData>({
    tenantId,
    name: '',
    key: '',
    description: '',
    iconUrl: '',
    color: '#6366f1',
    jiraProjectKey: '',
    azureDevopsAreaPath: ''
  });

  const [errors, setErrors] = useState<Partial<Record<keyof CreateProductData, string>>>({});
  const [showSuccess, setShowSuccess] = useState(false);

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof CreateProductData, string>> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Product name is required';
    } else if (formData.name.length < 3) {
      newErrors.name = 'Product name must be at least 3 characters';
    }

    if (!formData.key.trim()) {
      newErrors.key = 'Product key is required';
    } else if (!/^[A-Z0-9_]+$/.test(formData.key)) {
      newErrors.key = 'Product key must contain only uppercase letters, numbers, and underscores';
    } else if (formData.key.length < 2) {
      newErrors.key = 'Product key must be at least 2 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error('Please fix the validation errors');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('http://localhost:3001/api/v1/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Product created successfully!', {
          description: `${formData.name} is now ready for repository management`
        });

        setShowSuccess(true);

        // Reset form
        setFormData({
          tenantId,
          name: '',
          key: '',
          description: '',
          iconUrl: '',
          color: '#6366f1',
          jiraProjectKey: '',
          azureDevopsAreaPath: ''
        });

        // Call callback
        if (onProductCreated) {
          onProductCreated(data.data);
        }

        // Hide success message after 3 seconds
        setTimeout(() => setShowSuccess(false), 3000);
      } else {
        toast.error(data.message || 'Failed to create product');
      }
    } catch (error) {
      console.error('Failed to create product:', error);
      toast.error('Failed to create product. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (field: keyof CreateProductData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error for this field when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  // Auto-generate key from name
  const handleNameChange = (value: string) => {
    setFormData(prev => ({ ...prev, name: value, key: value.toUpperCase().replace(/[^A-Z0-9]/g, '_').substring(0, 10) }));
    if (errors.name || errors.key) {
      setErrors(prev => ({ ...prev, name: undefined, key: undefined }));
    }
  };

  return (
    <GlassPanel
      title="Create New Product"
      subtitle="Set up a new product to manage repositories and track quality metrics"
      className="max-w-2xl mx-auto"
    >
      {showSuccess && (
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-good/20 border border-good/40 p-3">
          <CheckCircle2 className="h-4 w-4 text-good" />
          <p className="text-sm text-good">Product created successfully! You can now add repositories.</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Product Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Product Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g., E-Commerce Platform"
              disabled={isLoading}
              className={errors.name ? 'border-critical' : ''}
            />
            {errors.name && <p className="text-xs text-critical">{errors.name}</p>}
          </div>

          {/* Product Key */}
          <div className="space-y-2">
            <Label htmlFor="key">Product Key *</Label>
            <Input
              id="key"
              value={formData.key}
              onChange={(e) => handleChange('key', e.target.value.toUpperCase())}
              placeholder="e.g., ECOMMERCE"
              disabled={isLoading}
              className={errors.key ? 'border-critical' : ''}
            />
            {errors.key && <p className="text-xs text-critical">{errors.key}</p>}
            <p className="text-xs text-muted-foreground">Auto-generated from name (editable)</p>
          </div>
        </div>

        {/* Description */}
        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={formData.description}
            onChange={(e) => handleChange('description', e.target.value)}
            placeholder="Brief description of this product and its purpose..."
            disabled={isLoading}
            rows={3}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Color */}
          <div className="space-y-2">
            <Label htmlFor="color">Brand Color</Label>
            <div className="flex gap-2">
              <Input
                id="color"
                type="color"
                value={formData.color}
                onChange={(e) => handleChange('color', e.target.value)}
                disabled={isLoading}
                className="h-10 w-20 p-1"
              />
              <Input
                value={formData.color}
                onChange={(e) => handleChange('color', e.target.value)}
                placeholder="#6366f1"
                disabled={isLoading}
                className="flex-1"
              />
            </div>
          </div>

          {/* Icon URL */}
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="iconUrl">Icon URL (optional)</Label>
            <Input
              id="iconUrl"
              value={formData.iconUrl}
              onChange={(e) => handleChange('iconUrl', e.target.value)}
              placeholder="https://example.com/icon.png"
              disabled={isLoading}
            />
          </div>
        </div>

        {/* Integration Settings */}
        <div className="border border-glass-border/60 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <Label className="text-sm font-semibold">Integration Settings (Optional)</Label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="jiraProjectKey">Jira Project Key</Label>
              <Input
                id="jiraProjectKey"
                value={formData.jiraProjectKey}
                onChange={(e) => handleChange('jiraProjectKey', e.target.value)}
                placeholder="e.g., PROJ"
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="azureDevopsAreaPath">Azure DevOps Area Path</Label>
              <Input
                id="azureDevopsAreaPath"
                value={formData.azureDevopsAreaPath}
                onChange={(e) => handleChange('azureDevopsAreaPath', e.target.value)}
                placeholder="e.g., \\Project\\Area"
                disabled={isLoading}
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          {onCancel && (
            <Button
              type="button"
              variant="ghost"
              onClick={onCancel}
              disabled={isLoading}
            >
              Cancel
            </Button>
          )}
          <Button
            type="submit"
            disabled={isLoading}
            className="min-w-[120px]"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-2" />
                Create Product
              </>
            )}
          </Button>
        </div>
      </form>
    </GlassPanel>
  );
}