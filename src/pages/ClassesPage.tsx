import { useEffect, useState } from 'react';
import { GraduationCap, Plus, Pencil, Trash2, Users } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { fetchClasses, createClass, updateClass, deleteClass } from '@/lib/studentService';
import type { Class } from '@/types';
import { toast } from 'sonner';

export function ClassesPage() {
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddEdit, setShowAddEdit] = useState(false);
  const [editingClass, setEditingClass] = useState<Class | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Class | null>(null);

  const loadData = async () => {
    setLoading(true);
    const { data } = await fetchClasses();
    setClasses(data);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await deleteClass(deleteTarget.id);
    if (error) {
      toast.error(error);
    } else {
      toast.success(`Class "${deleteTarget.name}" deleted`);
      loadData();
    }
    setShowDeleteConfirm(false);
    setDeleteTarget(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Classes</h1>
          <p className="text-sm text-slate-500 mt-1">{classes.length} classes</p>
        </div>
        <Button onClick={() => { setEditingClass(null); setShowAddEdit(true); }}>
          <Plus size={16} /> Add Class
        </Button>
      </div>

      {classes.length === 0 ? (
        <Card>
          <EmptyState
            icon={<GraduationCap size={40} />}
            title="No classes yet"
            description="Add classes to organize your students."
            action={
              <Button onClick={() => { setEditingClass(null); setShowAddEdit(true); }}>
                <Plus size={16} /> Add Class
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {classes.map((cls) => (
            <Card key={cls.id} className="p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-blue-50 rounded-xl text-blue-600">
                    <GraduationCap size={22} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-800">{cls.name}</h3>
                    <div className="flex items-center gap-1 mt-1">
                      <Users size={14} className="text-slate-400" />
                      <span className="text-sm text-slate-500">{cls.student_count ?? 0} students</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => { setEditingClass(cls); setShowAddEdit(true); }}
                    className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => { setDeleteTarget(cls); setShowDeleteConfirm(true); }}
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {showAddEdit && (
        <ClassForm
          cls={editingClass}
          onClose={() => { setShowAddEdit(false); setEditingClass(null); }}
          onSaved={() => { setShowAddEdit(false); setEditingClass(null); loadData(); }}
        />
      )}

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete Class"
        message={`Are you sure you want to delete class "${deleteTarget?.name}"? You cannot delete a class that still has students.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => { setShowDeleteConfirm(false); setDeleteTarget(null); }}
      />
    </div>
  );
}

function ClassForm({
  cls,
  onClose,
  onSaved,
}: {
  cls: Class | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(cls?.name ?? '');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error('Class name is required');
      return;
    }
    setSaving(true);
    const { error } = cls ? await updateClass(cls.id, name.trim()) : await createClass(name.trim());
    setSaving(false);
    if (error) {
      toast.error(error);
    } else {
      toast.success(cls ? 'Class updated' : 'Class added');
      onSaved();
    }
  };

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={cls ? 'Edit Class' : 'Add Class'}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving...' : cls ? 'Update' : 'Add'}
          </Button>
        </>
      }
    >
      <Input
        label="Class Name *"
        placeholder="e.g., 8A, 10 Science, 12 Commerce"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
      />
    </Modal>
  );
}
